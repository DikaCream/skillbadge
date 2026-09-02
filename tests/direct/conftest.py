"""Shared helpers for SkillBadge direct mode tests."""

import json
import sys
from datetime import datetime

import pytest

# A fixed "now" for deterministic time travel. Unix 1767225600.
BASE_ISO = "2030-01-01T00:00:00Z"


def to_hex(addr_bytes):
    """Convert address bytes to checksummed hex matching contract output."""
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex


def addr(addr_bytes):
    """Build an Address object for TreeMap[Address, ...] lookups."""
    from genlayer.py.types import Address

    if isinstance(addr_bytes, Address):
        return addr_bytes
    return Address(addr_bytes)


def set_time(iso_str: str) -> None:
    """Advance the contract's view of block time.

    The direct VM's ``warp()`` does not refresh ``message_raw['datetime']``,
    which is what the contract's ``_now()`` reads, so we mutate it directly.
    """
    import genlayer.gl as gl

    gl.message_raw["datetime"] = iso_str


def _reset():
    if "genlayer.gl" in sys.modules:
        gl = sys.modules["genlayer.gl"]
        if getattr(gl, "message_raw", None) is not None:
            gl.message_raw["datetime"] = BASE_ISO


@pytest.fixture(autouse=True)
def _reset_block_time():
    """Keep block time deterministic across tests.

    ``genlayer.gl`` is imported once per session, so ``message_raw['datetime']``
    leaks between tests. Reset it to a fixed base before and after each test.
    """
    _reset()
    yield
    _reset()


# ---------------------------------------------------------------- SkillBadge
SKILL_SKILL = "solidity"
SKILL_GITHUB_URL = "https://github.com/example-dev/contracts"
SKILL_NOTE = "A documented Solidity project with tests, audits and a deployed contract."
# Body served for every mocked fetch; the judge LLM sees this as evidence.
SKILL_PAGE = "Solidity code, tests, audits, deployment addresses, README."


def mock_verification(vm, verdict="VERIFIED", tier="silver", reason="Repo shows real, working Solidity.", body=SKILL_PAGE):
    """Mock the validator's web fetch and judge LLM for a SkillBadge verification."""
    vm.mock_web(r".*github\.com.*", {"status": 200, "body": body})
    vm.mock_llm(
        r".*hiring panel.*",
        json.dumps({"verdict": verdict, "tier": tier, "reason": reason}),
    )


def claim_badge(contract, vm, holder, url=SKILL_GITHUB_URL, skill=SKILL_SKILL, note=SKILL_NOTE):
    """Holder claims a skill; returns its int badge id."""
    vm.sender = holder
    return int(contract.claim_skill(url, skill, note))


def verified_badge(contract, vm, holder, verdict="VERIFIED", tier="silver", **kwargs):
    """Claim a badge and verify it with a mocked verdict; returns its int id."""
    bid = claim_badge(contract, vm, holder, **kwargs)
    vm.sender = holder
    mock_verification(vm, verdict=verdict, tier=tier)
    contract.verify_badge(bid)
    vm.clear_mocks()
    return bid