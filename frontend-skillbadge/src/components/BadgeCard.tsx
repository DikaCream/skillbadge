import type { Badge } from "../lib/types";
import { formatAddress } from "../lib/client";
import { TierChip, VerdictBadge } from "./StatusBadge";

interface BadgeCardProps {
  badge: Badge;
  me: string | null;
  busy: boolean;
  onVerify: (badge: Badge) => void;
}

export default function BadgeCard({ badge, me, busy, onVerify }: BadgeCardProps) {
  const isMine = !!me && me.toLowerCase() === badge.holder.toLowerCase();

  return (
    <article className="card badge-card">
      <div className="row badge-head">
        <span className="badge-id mono">BADGE #{badge.id}</span>
        <VerdictBadge verdict={badge.verdict} />
      </div>

      <h3 className="badge-skill">
        {badge.skill} <TierChip tier={badge.tier} />
      </h3>

      <a
        href={badge.github_url}
        target="_blank"
        rel="noreferrer"
        className="mono badge-url"
        title="Repo the validators fetched as evidence"
      >
        {badge.github_url}
      </a>

      <p className="badge-note">{badge.note || "No note"}</p>

      <span className="muted badge-holder">
        {isMine ? "you" : formatAddress(badge.holder)}
      </span>

      {badge.reason && badge.verdict !== "PENDING" && (
        <p className="badge-reason">{badge.reason}</p>
      )}

      <div className="row badge-actions">
        {badge.verdict === "PENDING" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => onVerify(badge)}
            title="Anyone can trigger verification; validators review the code"
          >
            Verify — validators review
          </button>
        )}
        {badge.verdict === "PENDING" && !me && (
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Connect a wallet to trigger verification
          </span>
        )}
      </div>
    </article>
  );
}