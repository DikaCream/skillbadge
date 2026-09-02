import type { Tier, Verdict } from "../lib/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`badge verdict-${verdict.toLowerCase()}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function TierChip({ tier }: { tier: Tier }) {
  if (!tier) return null;
  return <span className={`tier-chip tier-${tier}`}>{tier}</span>;
}