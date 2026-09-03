# SkillBadge

SkillBadge is a credential dapp on GenLayer's StudioNet. You claim a skill, say "python" or "typescript", and back it with code in a GitHub repo you own. The network's validators fetch that code, check the repo is really yours, and vote: **VERIFIED** (bronze, silver, or gold) or **REJECTED**, each with a written reason. No money moves in either case.

Claims and verifications are free. Anyone can verify any badge, not just their own, and a verified badge stays on-chain as public proof.

## Try it

- App: https://skillbadge-cyan.vercel.app (chain 61999, no wallet funds needed)
- Contract: `0x4fd779b14531f933CD271B5DD78fC792918b53Df` on StudioNet
- Board state (September 2026): two claims, both VERIFIED silver

| Badge | Skill | Evidence | Verdict |
|---|---|---|---|
| 1 | python | `contracts/skill_badge.py`, pinned to a commit | VERIFIED silver |
| 2 | typescript | `frontend-skillbadge/src/lib/contract.ts`, pinned to a commit | VERIFIED silver |

Both claims use the same wallet and the same owner-proof file, `skillbadge-verify/<wallet-address>.txt`, committed in this repo. That file is what ties the wallet to the GitHub account.

## What the validators check

A claim carries two URLs, both raw GitHub files pinned to a full commit SHA:

1. **Owner-proof file.** The URL must contain the claimant's wallet address, and the file itself must contain it too. Only the repo owner can commit a file named after a wallet, so this binds the wallet to the GitHub identity.
2. **Evidence file.** The code to judge, from the same repo and commit as the proof.

The contract refuses everything else: repo landing pages, `/blob/` links, branch names, and short SHAs. A landing page renders as README plus filenames, so there's nothing to read. A branch moves, so evidence could change after the claim. Only a full 40-hex SHA pins the exact content the validators will judge.

The claim form handles this for you. Paste a `/blob/` link or a branch-based raw URL and the form resolves it to the current commit through the GitHub API, then shows you the pinned URL before you submit.

## How a claim works

1. Commit `skillbadge-verify/<your-address>.txt` (your wallet address inside) to the repo that proves the skill. Commit the code to judge too, then copy both raw links from GitHub.
2. File the claim: both URLs, a skill name (2-40 chars), an optional note up to 300 chars. Ten claims per address.
3. Anyone calls `verify_badge(badge_id)`. Validators fetch the proof file and the evidence, check ownership first, then judge the code.
4. A verdict that can't be parsed leaves the badge PENDING. You can retry after a 5-minute cooldown, up to 5 attempts. A failed attempt costs nothing.

The contract strips `[System]` and `[User]` markers from claim text so prompt injection has nothing to grab, and it refuses URLs that resolve to private or internal hosts.

## Failure handling

Reads retry automatically when the RPC drops a request, which happens now and then on consensus calls. When something does fail, the UI says what kind of failure it was: network (can't reach StudioNet), contract (the call reverted, with the reason), or wallet (request rejected). Every banner has a retry button where retrying is safe.

## Run it locally

```bash
./scripts/setup.sh                # venv + deps (official PyPI via pip.conf)
./scripts/verify-skillbadge.sh    # lint + direct tests
./scripts/verify-skillbadge.sh --frontend      # + frontend typecheck & build
./scripts/verify-skillbadge.sh --integration   # StudioNet tests (~5 min)
```

Frontend:

```bash
cd frontend-skillbadge
npm install
cp .env.example .env.local        # defaults point at the live contract
npm run dev
```

## Deploy your own

```bash
# needs a deployer keystore in .env (private key, or keystore path + password)
genlayer deploy contracts/skill_badge.py
```

Point `VITE_CONTRACT_ADDRESS` in `frontend-skillbadge/.env.local` at the new address and redeploy the frontend.

## Repo layout

```
contracts/skill_badge.py        the contract, one file
frontend-skillbadge/            Vite + React app
skillbadge-verify/              owner-proof files binding wallets to this repo
tests/direct/                   local tests, mocked web + LLM
tests/integration/              StudioNet tests against real consensus
scripts/setup.sh                environment bootstrap
scripts/verify-skillbadge.sh    lint + tests in one command
```

Pages: `/` shows stats and top developers, `/badges` lists every claim with search, verdict filters that show real counts, sorting, dates, attempt chips, and a live retry countdown, and `/claim` files a claim with the live evidence preview described above.

## Tests

Direct tests mock the web fetch and the LLM, so the URL rules (commit pinning, wallet binding, same-repo check), the retry loop, the attempt cap, duplicate claims, both tiers, and the leaderboard all run locally. Integration tests hit real StudioNet consensus and verify the python claim end to end. The frontend has no automated test suite yet; its pages are typechecked and built, and the contract logic carries the real tests.