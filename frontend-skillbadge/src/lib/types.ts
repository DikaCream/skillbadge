/**
 * Types mirroring the SkillBadge contract state.
 */

export type Verdict = "PENDING" | "VERIFIED" | "REJECTED";
export type Tier = "" | "bronze" | "silver" | "gold";

export interface Badge {
  id: number;
  holder: string;
  skill: string;
  github_url: string;
  note: string;
  verdict: Verdict;
  tier: Tier;
  reason: string;
  attempts: number;
  last_verified_at: number;
  created_at: number;
  rank?: number; // leaderboard only
}

export interface Stats {
  total_claims: number;
  verified: number;
  pending: number;
  rejected: number;
  max_claims_per_user: number;
}

export function toInt(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
}