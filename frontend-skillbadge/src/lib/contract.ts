import { CONTRACT_ADDRESS } from "../config";
import { Badge, Stats, toInt } from "./types";
import { CalldataAddress } from "genlayer-js/types";

/** Wrap a 0x-address into the CalldataAddress wrapper genlayer-js expects. */
function toCalldataAddress(address: string): CalldataAddress {
  const hex = address.startsWith("0x") ? address.slice(2) : address;
  const bytes = new Uint8Array(
    hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
  );
  return new CalldataAddress(bytes);
}

function fromMapLike(v: any): Record<string, any> {
  if (v instanceof Map) {
    const out: Record<string, any> = {};
    v.forEach((val: any, key: any) => {
      out[String(key)] = val;
    });
    return out;
  }
  return (v ?? {}) as Record<string, any>;
}

function toBadge(v: any): Badge {
  const o = fromMapLike(v);
  return {
    id: toInt(o.id),
    holder: String(o.holder ?? ""),
    skill: String(o.skill ?? ""),
    github_url: String(o.github_url ?? ""),
    note: String(o.note ?? ""),
    verdict: String(o.verdict ?? "PENDING") as Badge["verdict"],
    tier: String(o.tier ?? "") as Badge["tier"],
    reason: String(o.reason ?? ""),
    attempts: toInt(o.attempts),
    last_verified_at: toInt(o.last_verified_at),
    created_at: toInt(o.created_at),
    rank: o.rank != null ? toInt(o.rank) : undefined,
  };
}

function toStats(v: any): Stats {
  const o = fromMapLike(v);
  return {
    total_claims: toInt(o.total_claims),
    verified: toInt(o.verified),
    pending: toInt(o.pending),
    rejected: toInt(o.rejected),
    max_claims_per_user: toInt(o.max_claims_per_user),
  };
}

/**
 * Typed wrapper over the deployed SkillBadge contract.
 * Read methods work without an account; write methods sign via the client.
 * Address-typed args are encoded from the contract schema by genlayer-js.
 */
export class SkillBadge {
  constructor(private client: any, private address: string = CONTRACT_ADDRESS) {}

  private async read(functionName: string, args: unknown[] = []): Promise<any> {
    return this.client.readContract({
      address: this.address as `0x${string}`,
      functionName,
      args,
    });
  }

  private async write(
    functionName: string,
    args: unknown[],
  ): Promise<string> {
    const txHash = await this.client.writeContract({
      address: this.address as `0x${string}`,
      functionName,
      args,
    });
    return txHash as string;
  }

  async waitForReceipt(txHash: string, retries = 40, interval = 3000): Promise<any> {
    return this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries,
      interval,
    });
  }

  // ---- reads ----------------------------------------------------------
  async getStats(): Promise<Stats> {
    return toStats(await this.read("get_stats"));
  }

  async getBadge(id: number): Promise<Badge | null> {
    const v = await this.read("get_badge", [id]);
    if (v == null) return null;
    return toBadge(v);
  }

  async listBadges(offset = 0, limit = 50): Promise<Badge[]> {
    const v = await this.read("list_badges", [offset, limit]);
    return Array.isArray(v) ? v.map(toBadge) : [];
  }

  async listClaimsByUser(holder: string, offset = 0, limit = 50): Promise<Badge[]> {
    const v = await this.read("list_claims_by_user", [
      toCalldataAddress(holder),
      offset,
      limit,
    ]);
    return Array.isArray(v) ? v.map(toBadge) : [];
  }

  async getLeaderboard(limit = 10): Promise<Badge[]> {
    const v = await this.read("get_leaderboard", [limit]);
    return Array.isArray(v) ? v.map(toBadge) : [];
  }

  // ---- writes ---------------------------------------------------------
  /** Free: file a claim for a skill. */
  async claimSkill(githubUrl: string, skill: string, note: string): Promise<string> {
    return this.write("claim_skill", [githubUrl, skill, note]);
  }

  /** Permissionless: run validator consensus on a pending badge. */
  async verifyBadge(badgeId: number): Promise<string> {
    return this.write("verify_badge", [badgeId]);
  }
}