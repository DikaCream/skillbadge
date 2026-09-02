# SkillBadge

A credential dapp on [GenLayer](https://genlayer.com)'s StudioNet. You claim a
skill against a public GitHub repo; the network's validators actually read the
code and judge whether the repo backs the claim.

No money. One AI call per badge. The verdict is a tier, not a payout.

## What the validators do

The judge runs on GenLayer's AI validators. Same who vote `AGREE` on the
consensus layer. They fetch the repo URL, look at the code, and write a
verdict: **VERIFIED** (bronze, silver, or gold) or **REJECTED**, with a reason.

The claim is free. Verification is permissionless: you can verify your own
badge or someone else's. A REJECTED badge can be re-claimed and retried; a
VERIFIED badge stays on-chain as proof.

## How a badge goes

1. The holder writes a claim: a public (https only) GitHub URL, a skill name
   (3–40 chars), and an optional note (up to 300 chars). Up to 10 claims per
   address.
2. Anyone calls `verify_badge(badge_id)`. The validators fetch the URL and
   vote on a verdict: VERIFIED bronze/silver/gold, or REJECTED with a reason.
3. If the verdict string can't be parsed, the badge stays PENDING and can be
   retried after a 5-minute cooldown, up to 5 attempts. Fail closed — a stuck
   badge never pays out anything (there's nothing to pay out).

The contract neutralizes `[System]` / `[User]` markers in the claim text so
prompt injection has nothing to latch onto, and refuses URLs that point at
private or internal hosts.

## Live state

Contract on StudioNet: `0xde308783bDB67467cb94f4De6d9Bf65e73C0A321`

It was deployed with 5/5 validator agreement in tx
`0xf5a7a3c6...6252` (ACCEPTED).

The frontend lives at https://skillbadge-cyan.vercel.app and talks directly to
that contract (chain id 61999, gasless — you only need GEN in the wallet to
make the claims; the claims themselves cost nothing).

## Repository layout

```
contracts/skill_badge.py        the contract, one file
tests/direct/                   local tests with mocked web + LLM
tests/integration/              StudioNet tests against real consensus
frontend-skillbadge/            Vite + React app
scripts/setup.sh                environment bootstrap
scripts/verify-skillbadge.sh    lint + tests in one command
```

## Quickstart

```bash
./scripts/setup.sh               # Python venv + deps (official PyPI via pip.conf)
./scripts/verify-skillbadge.sh   # lint + direct tests
./scripts/verify-skillbadge.sh --frontend     # + frontend typecheck & build
./scripts/verify-skillbadge.sh --integration  # StudioNet tests (~4 min)
```

To run the frontend locally:

```bash
cd frontend-skillbadge
npm install
cp .env.example .env.local   # defaults point at the live contract
npm run dev
```

## Deploying your own instance

```bash
# needs a deployer keystore in .env (private key or keystore path + password)
genlayer deploy contracts/skill_badge.py
```

Then update `VITE_CONTRACT_ADDRESS` in `frontend-skillbadge/.env.local` with
the new address and redeploy the frontend.

## What the contract refuses to do

- No payouts, no fees, no escrow — nothing to rug.
- No private or internal URLs: IP-literal, localhost, and private-range
  addresses are rejected at claim time.
- No network requests on the contract's own balance; verifications run under
  consensus, so the wallet that triggers them pays nothing.
- No unlimited junk: verify attempts are capped at 5 with a cooldown, claims
  at 10 per address.

## Test coverage

Direct tests (mocked web + LLM) cover the happy path, both tiers, duplicate
claims, the fail-closed retry loop, the attempt cap, and the leaderboard.
Integration tests run against real StudioNet consensus and verify an actual
repo (`github.com/genlayerlabs/genlayer-py`, skill: python) end to end.