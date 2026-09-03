"""SkillBadge direct-mode tests — happy path, tiers, fail-closed, views."""

from tests.direct.conftest import (
    SKILL_EVIDENCE_URL,
    SKILL_NOTE,
    SKILL_PAGE,
    SKILL_OWNER,
    SKILL_REPO,
    SKILL_SHA,
    SKILL_SKILL,
    addr,
    claim_badge,
    mock_verification,
    set_time,
    skill_proof_url,
    to_hex,
    verified_badge,
)


# ---------------------------------------------------------------- happy path
def test_claim_then_verify_verified(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = claim_badge(contract, direct_vm, direct_alice)

    b = contract.get_badge(bid)
    assert b["verdict"] == "PENDING"
    assert b["skill"] == SKILL_SKILL
    assert b["owner_proof_url"] == skill_proof_url(direct_alice)
    assert b["evidence_url"] == SKILL_EVIDENCE_URL
    assert b["holder"].lower() == to_hex(direct_alice).lower()
    assert contract.get_stats()["pending"] == 1

    mock_verification(direct_vm, verdict="VERIFIED", tier="gold")
    contract.verify_badge(bid)
    direct_vm.clear_mocks()

    b = contract.get_badge(bid)
    assert b["verdict"] == "VERIFIED"
    assert b["tier"] == "gold"
    assert b["reason"]
    stats = contract.get_stats()
    assert stats["verified"] == 1
    assert stats["pending"] == 0


def test_claim_then_verify_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = claim_badge(contract, direct_vm, direct_alice)

    mock_verification(direct_vm, verdict="REJECTED", tier="", reason="Repo is an empty stub.")
    contract.verify_badge(bid)
    direct_vm.clear_mocks()

    b = contract.get_badge(bid)
    assert b["verdict"] == "REJECTED"
    assert b["tier"] == ""

    assert contract.get_stats()["verified"] == 0


def test_tiers_are_stored(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    for tier in ("bronze", "silver", "gold"):
        bid = claim_badge(contract, direct_vm, direct_alice, skill=f"skill-{tier}")
        mock_verification(direct_vm, verdict="VERIFIED", tier=tier)
        contract.verify_badge(bid)
        direct_vm.clear_mocks()
        assert contract.get_badge(bid)["tier"] == tier


def test_verify_by_stranger_is_permissionless(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = claim_badge(contract, direct_vm, direct_alice)

    direct_vm.sender = direct_bob
    mock_verification(direct_vm, verdict="VERIFIED", tier="silver")
    contract.verify_badge(bid)

    assert contract.get_badge(bid)["verdict"] == "VERIFIED"


# ---------------------------------------------------------------- claim rules
def test_duplicate_pending_claim_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    claim_badge(contract, direct_vm, direct_alice)

    with direct_vm.expect_revert("skill already claimed or verified"):
        claim_badge(contract, direct_vm, direct_alice)


def test_duplicate_verified_claim_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    verified_badge(contract, direct_vm, direct_alice)

    with direct_vm.expect_revert("skill already claimed or verified"):
        claim_badge(contract, direct_vm, direct_alice)


def test_reclaim_after_rejected_is_allowed(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    first = claim_badge(contract, direct_vm, direct_alice)
    mock_verification(direct_vm, verdict="REJECTED", tier="", reason="Stub repo.")
    contract.verify_badge(first)
    direct_vm.clear_mocks()

    second = claim_badge(contract, direct_vm, direct_alice)
    assert second != first
    assert contract.get_badge(first)["verdict"] == "REJECTED"
    assert contract.get_badge(second)["verdict"] == "PENDING"


def test_claim_limit_per_user(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    for i in range(10):
        claim_badge(contract, direct_vm, direct_alice, skill=f"skill-{i}")
    with direct_vm.expect_revert("claim limit reached"):
        claim_badge(contract, direct_vm, direct_alice, skill="overflow")


def test_claim_bad_url_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    good_proof = skill_proof_url(direct_alice)
    for url in ("http://github.com/example-dev/contracts", "https://localhost/x", "https://127.0.0.1/x"):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("owner_proof_url must be a public https"):
            contract.claim_skill(url, SKILL_EVIDENCE_URL, SKILL_SKILL, SKILL_NOTE)
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("evidence_url must be a public https"):
            contract.claim_skill(good_proof, url, SKILL_SKILL, SKILL_NOTE)


# ---------------------------------------------- commit-pinned evidence rules
def test_claim_rejects_non_raw_urls(direct_vm, direct_deploy, direct_alice):
    """Repo pages, blob links and other hosts can't be evidence — the file
    must be pinned to a full commit SHA so validators read one immutable copy."""
    contract = direct_deploy("contracts/skill_badge.py")
    good_proof = skill_proof_url(direct_alice)
    branch = f"https://raw.githubusercontent.com/{SKILL_OWNER}/{SKILL_REPO}/main/src/contract.sol"
    blob = f"https://github.com/{SKILL_OWNER}/{SKILL_REPO}/blob/{SKILL_SHA}/src/contract.sol"
    repo_page = f"https://github.com/{SKILL_OWNER}/{SKILL_REPO}"
    short_sha = f"https://raw.githubusercontent.com/{SKILL_OWNER}/{SKILL_REPO}/{SKILL_SHA[:7]}/src/contract.sol"
    for url in (branch, blob, repo_page, short_sha):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("evidence_url must be a raw.githubusercontent.com file pinned"):
            contract.claim_skill(good_proof, url, SKILL_SKILL, SKILL_NOTE)


def test_claim_rejects_unpinned_owner_proof(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    unpinned = (
        f"https://raw.githubusercontent.com/{SKILL_OWNER}/{SKILL_REPO}/main/"
        f"skillbadge-verify/{to_hex(direct_alice).lower()}.txt"
    )
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("owner_proof_url must be a raw.githubusercontent.com file pinned"):
        contract.claim_skill(unpinned, SKILL_EVIDENCE_URL, SKILL_SKILL, SKILL_NOTE)


def test_claim_requires_holder_address_in_proof(direct_vm, direct_deploy, direct_alice, direct_bob):
    """The owner-proof file must be named after the claimant's own wallet, so
    only someone who controls the repo can place it."""
    contract = direct_deploy("contracts/skill_badge.py")
    # Proof names BOB's address while ALICE claims — must revert.
    stranger_proof = skill_proof_url(direct_bob)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("owner proof URL must reference this wallet address"):
        contract.claim_skill(stranger_proof, SKILL_EVIDENCE_URL, SKILL_SKILL, SKILL_NOTE)
    # Same-file trick: the proof path doubling as evidence is rejected too.
    same = skill_proof_url(direct_alice)
    with direct_vm.expect_revert("different files"):
        contract.claim_skill(same, same, SKILL_SKILL, SKILL_NOTE)


def test_claim_requires_proof_and_evidence_from_same_repo(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    proof = skill_proof_url(direct_alice, owner="other-owner")
    with direct_vm.expect_revert("same repository"):
        contract.claim_skill(proof, SKILL_EVIDENCE_URL, SKILL_SKILL, SKILL_NOTE)


def test_claim_bad_skill_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("skill must be 2-40 characters"):
        contract.claim_skill(skill_proof_url(direct_alice), SKILL_EVIDENCE_URL, "x", SKILL_NOTE)
    with direct_vm.expect_revert("skill may only contain"):
        contract.claim_skill(skill_proof_url(direct_alice), SKILL_EVIDENCE_URL, "solidity<script>", SKILL_NOTE)


def test_claim_long_note_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("note must be 300 characters or less"):
        contract.claim_skill(skill_proof_url(direct_alice), SKILL_EVIDENCE_URL, SKILL_SKILL, "x" * 301)


# ---------------------------------------------------------------- verify rules
def test_verify_non_pending_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = verified_badge(contract, direct_vm, direct_alice)

    mock_verification(direct_vm)
    with direct_vm.expect_revert("badge is not pending"):
        contract.verify_badge(bid)
    direct_vm.clear_mocks()


def test_verify_rejected_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = claim_badge(contract, direct_vm, direct_alice)
    mock_verification(direct_vm, verdict="REJECTED", tier="")
    contract.verify_badge(bid)
    direct_vm.clear_mocks()

    with direct_vm.expect_revert("badge is not pending"):
        contract.verify_badge(bid)


def test_failed_verification_stays_pending_then_retry(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = claim_badge(contract, direct_vm, direct_alice)

    # Validators return something outside the allowed set -> fail closed.
    mock_verification(direct_vm, verdict="MAYBE", tier="")
    contract.verify_badge(bid)
    direct_vm.clear_mocks()

    b = contract.get_badge(bid)
    assert b["verdict"] == "PENDING"  # fail closed
    assert b["attempts"] == 1
    assert contract.get_stats()["verified"] == 0

    # Cooldown: immediate retry reverts.
    mock_verification(direct_vm, verdict="VERIFIED", tier="silver")
    with direct_vm.expect_revert("verification was just attempted"):
        contract.verify_badge(bid)

    # After the cooldown the retry succeeds.
    set_time("2030-01-01T00:05:00Z")
    contract.verify_badge(bid)
    assert contract.get_badge(bid)["verdict"] == "VERIFIED"


def test_retry_limit_reached(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    bid = claim_badge(contract, direct_vm, direct_alice)

    for i in range(5):
        mock_verification(direct_vm, verdict="MAYBE", tier="")
        contract.verify_badge(bid)
        direct_vm.clear_mocks()
        set_time(f"2030-01-01T00:{5 * (i + 1):02d}:00Z")  # past the cooldown

    b = contract.get_badge(bid)
    assert b["verdict"] == "PENDING"
    assert b["attempts"] == 5

    mock_verification(direct_vm, verdict="VERIFIED", tier="gold")
    with direct_vm.expect_revert("verification retry limit reached"):
        contract.verify_badge(bid)


# ---------------------------------------------------------------- views
def test_views_and_leaderboard(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/skill_badge.py")

    assert contract.get_badge(1) is None
    assert contract.get_stats()["total_claims"] == 0

    alice_gold = verified_badge(contract, direct_vm, direct_alice, tier="gold")
    alice_bronze = verified_badge(contract, direct_vm, direct_alice, skill="rust", tier="bronze")
    bob_silver = verified_badge(contract, direct_vm, direct_bob, skill="solidity", tier="silver")

    # Per-user listing.
    mine = contract.list_claims_by_user(addr(direct_alice), 0, 10)
    assert [b["id"] for b in mine] == [alice_gold, alice_bronze]
    assert contract.list_claims_by_user(addr(direct_charlie), 0, 10) == []

    # Global listing.
    all_badges = contract.list_badges(0, 10)
    assert len(all_badges) == 3
    assert contract.list_badges(3, 10) == []

    # Leaderboard: gold before silver before bronze, rank assigned.
    board = contract.get_leaderboard(10)
    assert [b["tier"] for b in board] == ["gold", "silver", "bronze"]
    assert [b["rank"] for b in board] == [1, 2, 3]
    assert board[0]["id"] == alice_gold

    # Webb: rejected never appears on the leaderboard.
    rejected = claim_badge(contract, direct_vm, direct_charlie, skill="go")
    mock_verification(direct_vm, verdict="REJECTED", tier="")
    contract.verify_badge(rejected)
    direct_vm.clear_mocks()
    assert len(contract.get_leaderboard(10)) == 3


def test_stats_counts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/skill_badge.py")
    verified_badge(contract, direct_vm, direct_alice, tier="gold")

    pending = claim_badge(contract, direct_vm, direct_alice, skill="rust")  # reject first? no: pending
    assert contract.get_stats()["total_claims"] == 2
    assert contract.get_stats()["verified"] == 1
    assert contract.get_stats()["pending"] == 1

    mock_verification(direct_vm, verdict="REJECTED", tier="")
    contract.verify_badge(pending)
    direct_vm.clear_mocks()
    stats = contract.get_stats()
    assert stats["verified"] == 1
    assert stats["pending"] == 0
    assert stats["rejected"] == 1