"""Integration tests for SkillBadge — require GenLayer Studio running.

Run with: gltest --network studionet tests/integration/test_skill_badge.py -v -s

These exercise the real consensus pipeline: a claim files an owner-proof file
(named after the claimant's wallet) plus a commit-pinned raw evidence file in
DikaCream/skillbadge, and at verification time GenLayer's AI validators fetch
both, check the proof contains the wallet address, review the evidence for
the claimed skill, and reach an equivalence-principle tier verdict. The
verdict itself is genuine consensus (not reproducible byte-for-byte), so the
tests assert the *mechanism*: the badge reaches a terminal VERIFIED or
REJECTED state and the counters move.

Account 0 is fixed in gltest.config.yaml; its wallet is bound to the repo
via the skillbadge-verify/ file committed in this repository. If you change
those accounts, commit a new skillbadge-verify/<address>.txt file and update
COMMIT_SHA to a commit that contains it.
"""

import time

import pytest
from genlayer_py.types import CalldataAddress
from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

# A real, stable, public repo holding this contract and its frontend. The
# owner-proof file (named after the fixed test account) and the evidence files
# are committed here, and every claim URL pins a full 40-hex commit SHA so the
# validators read one immutable copy.
OWNER = "DikaCream"
REPO = "skillbadge"
COMMIT_SHA = "d14c11853b575f38eca22fffd83d913fb22794ff"
RAW = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{COMMIT_SHA}"
SKILL = "python"
EVIDENCE_PYTHON = f"{RAW}/skill_badge.py"
EVIDENCE_TYPESCRIPT = f"{RAW}/frontend-skillbadge/src/lib/contract.ts"
TERMINAL_VERDICTS = {"VERIFIED", "REJECTED"}
MAX_WAIT_SECONDS = 180
POLL_SECONDS = 5


def owner_proof_url(holder_address: str) -> str:
    """The wallet-bound proof file for a given holder address."""
    return f"{RAW}/skillbadge-verify/{holder_address.lower()}.txt"


def _deploy(account):
    factory = get_contract_factory("SkillBadge")
    contract = factory.deploy(account=account)

    assert contract.get_stats(args=[]).call()["total_claims"] == 0
    return contract


def _get_badge(contract, badge_id):
    return contract.get_badge(args=[badge_id]).call()


def _wait_for_terminal(contract, badge_id):
    deadline = time.time() + MAX_WAIT_SECONDS
    while time.time() < deadline:
        badge = _get_badge(contract, badge_id)
        if badge is not None and badge["verdict"] in TERMINAL_VERDICTS:
            return badge
        time.sleep(POLL_SECONDS)
    return _get_badge(contract, badge_id)


@pytest.mark.integration
def test_claim_then_verify_reaches_consensus():
    accounts = get_accounts()
    holder = accounts[0]
    contract = _deploy(account=holder)

    receipt = contract.claim_skill(
        args=[
            owner_proof_url(holder.address),
            EVIDENCE_PYTHON,
            SKILL,
            "The SkillBadge contract itself: real, maintained GenVM Python.",
        ],
    ).transact(wait_interval=10000, wait_retries=15)
    assert tx_execution_succeeded(receipt)

    badge = _get_badge(contract, 1)
    assert badge is not None
    assert badge["verdict"] == "PENDING"
    assert badge["skill"] == SKILL
    assert badge["holder"].lower() == holder.address.lower()
    assert contract.get_stats(args=[]).call()["pending"] == 1

    # Verification is permissionless; retry until the tx is accepted.
    deadline = time.time() + 60
    accepted = False
    while time.time() < deadline and not accepted:
        try:
            receipt = contract.verify_badge(
                args=[1],
            ).transact(wait_interval=10000, wait_retries=30)
            accepted = tx_execution_succeeded(receipt)
        except Exception:
            pass
        if not accepted:
            time.sleep(POLL_SECONDS)

    badge = _wait_for_terminal(contract, 1)
    assert badge is not None
    assert badge["verdict"] in TERMINAL_VERDICTS, "consensus must reach a terminal verdict"
    assert badge["attempts"] >= 1
    if badge["verdict"] == "VERIFIED":
        assert badge["tier"] in ("bronze", "silver", "gold")
    assert isinstance(badge["reason"], str) and badge["reason"]

    stats = contract.get_stats(args=[]).call()
    assert stats["total_claims"] == 1
    # Verified or not, the claim is no longer pending… except REJECTED counts
    # in the same "not verified" bucket as PENDING by design.
    assert stats["verified"] in (0, 1)


@pytest.mark.integration
def test_views_expose_claims_and_leaderboard():
    accounts = get_accounts()
    holder = accounts[2]
    contract = _deploy(account=holder)

    receipt = contract.claim_skill(
        args=[
            owner_proof_url(holder.address),
            EVIDENCE_TYPESCRIPT,
            "typescript",
            "",
        ],
    ).transact(wait_interval=10000, wait_retries=15)
    assert tx_execution_succeeded(receipt)

    listed = contract.list_badges(args=[0, 50]).call()
    assert len(listed) == 1
    assert listed[0]["id"] == 1

    mine = contract.list_claims_by_user(
        args=[CalldataAddress(holder.address), 0, 50]
    ).call()
    assert len(mine) == 1
    assert mine[0]["skill"] == "typescript"
    assert contract.get_leaderboard(args=[10]).call() == []  # nothing verified yet