# SkillBadge

SkillBadge is a credential dapp on GenLayer's StudioNet. You claim a skill, say "python" or "typescript", against a public GitHub repo. The network's validators fetch your URL, read what's actually there, and vote on a verdict: **VERIFIED** (bronze, silver, or gold) or **REJECTED**, each with a written reason. No money moves in either case.

Claims and verifications are free. Anyone can verify any badge, not just their own, and a verified badge stays on-chain as public proof.

## Try it

- App: https://skillbadge-cyan.vercel.app (chain 61999, no wallet funds needed)
- Contract: `0xde308783bDB67467cb94f4De6d9Bf65e73C0A321` on StudioNet, deployed in tx `0xf5a7a3c6...6252` with 5/5 validator agreement
- Board state (early September 2026): three claims, two verified

| Badge | Skill | Evidence | Verdict |
|---|---|---|---|
| 1 | python | `genlayerlabs/genlayer-py` repo page | VERIFIED silver |
| 2 | typescript | `DikaCream/Truth-Bets` repo page | REJECTED |
| 3 | typescript | raw `contract.ts` from the same repo | VERIFIED silver |

Badges 2 and 3 are the same repo and the same skill. The only difference is the URL form, and that's worth understanding before you claim anything.

## What validators actually read

The contract fetches evidence with `web.render(url, mode="text")`. Validators get the page as rendered text, not a file tree. That single fact decides most claims:

- A repo landing page (`github.com/owner/repo`) renders as its README plus a list of filenames. No source code. Claiming "typescript" against that page gets REJECTED, because there's nothing to read.
- A raw file (`raw.githubusercontent.com/owner/repo/main/src/file.ts`) renders as the actual source. That's what verifies.
- Docs and rendered content, like a README that shows real usage, work when the page itself carries the proof.

Badge 2 above was rejected with: "only a repository README and file listing, not actual TypeScript source code." Re-claimed against the raw file, it came back VERIFIED silver. Same repo, same skill; only the URL changed.

The claim form enforces this rule for you. As you type it shows what the validators will fetch, and it rewrites GitHub `/blob/` links to their `raw.githubusercontent.com` equivalents before submitting.

## How a claim works

1. You file a claim: a public https URL, a skill name (2–40 chars), an optional note up to 300 chars. Ten claims per address.
2. Anyone calls `verify_badge(badge_id)`. The validators fetch the URL and settle on a verdict with a reason.
3. A verdict that can't be parsed leaves the badge PENDING. You can retry after a 5-minute cooldown, up to 5 attempts, and a failed attempt costs nothing.

The contract strips `[System]` and `[User]` markers from claim text so prompt injection has nothing to grab, and it refuses URLs that resolve to private or internal hosts.

## Run it locally

```bash
./scripts/setup.sh                # venv + deps (official PyPI via pip.conf)
./scripts/verify-skillbadge.sh    # lint + direct tests
./scripts/verify-skillbadge.sh --frontend      # + frontend typecheck & build
./scripts/verify-skillbadge.sh --integration   # StudioNet tests (~4 min)
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
tests/direct/                   local tests, mocked web + LLM
tests/integration/              StudioNet tests against real consensus
scripts/setup.sh                environment bootstrap
scripts/verify-skillbadge.sh    lint + tests in one command
```

Pages: `/` shows stats and top developers, `/badges` lists every claim with search, verdict filters that show real counts, sorting, claim and review dates, attempt chips, and a live retry countdown, and `/claim` files a claim with the evidence preview described above.

## Tests

Direct tests mock the web fetch and the LLM, so the retry loop, the attempt cap, duplicate claims, both tiers, and the leaderboard all run locally. Integration tests hit real StudioNet consensus and verify `genlayerlabs/genlayer-py` (skill: python) end to end. The frontend has no automated test suite yet; its pages are typechecked and built, and the contract logic carries the real tests.
