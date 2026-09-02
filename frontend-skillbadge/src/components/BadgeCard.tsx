import { useEffect, useState } from "react";
import type { Badge } from "../lib/types";
import {
  fmtCountdown,
  formatAddress,
  formatDate,
  timeAgo,
} from "../lib/client";
import { TierChip, VerdictBadge } from "./StatusBadge";

interface BadgeCardProps {
  badge: Badge;
  me: string | null;
  busy: boolean;
  onVerify: (badge: Badge) => void;
}

export default function BadgeCard({ badge, me, busy, onVerify }: BadgeCardProps) {
  const isMine = !!me && me.toLowerCase() === badge.holder.toLowerCase();
  const [now, setNow] = useState(() => Date.now());

  // Tick only while a pending badge is inside the verification cooldown.
  const cooldownUntil = (badge.last_verified_at + 300) * 1000;
  const inCooldown =
    badge.verdict === "PENDING" &&
    badge.last_verified_at > 0 &&
    now < cooldownUntil;

  useEffect(() => {
    if (!inCooldown) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inCooldown]);

  const accent =
    badge.verdict === "VERIFIED"
      ? "acc-verified"
      : badge.verdict === "REJECTED"
        ? "acc-rejected"
        : "acc-pending";

  return (
    <article className={`card badge-card ${accent}`}>
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
        {badge.github_url.replace(/^https?:\/\//, "")}
      </a>

      <p className="badge-note">{badge.note || "No note"}</p>

      <div className="badge-meta">
        <div className="meta-item">
          <span className="meta-label">Claimant</span>
          <span className="meta-value mono">
            {isMine ? "you" : formatAddress(badge.holder)}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Claimed</span>
          <span className="meta-value"> {formatDate(badge.created_at)}</span>
        </div>
        {badge.last_verified_at > 0 && (
          <div className="meta-item">
            <span className="meta-label">Reviewed</span>
            <span className="meta-value">
              {" "}
              {timeAgo(badge.last_verified_at)} ({formatDate(badge.last_verified_at)})
            </span>
          </div>
        )}
      </div>

      {badge.reason && badge.verdict !== "PENDING" && (
        <p
          className={`badge-reason ${
            badge.verdict === "VERIFIED" ? "reason-ok" : "reason-no"
          }`}
        >
          {badge.reason}
        </p>
      )}

      <div className="row badge-actions">
        {badge.verdict === "PENDING" && (
          <>
            {badge.attempts > 0 && (
              <span className="attempt-chip mono">
                {badge.attempts}/5 attempts
              </span>
            )}
            {inCooldown ? (
              <span className="cooldown mono" title="Cooldown after a review attempt">
                retry in {fmtCountdown(cooldownUntil - now)}
              </span>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() => onVerify(badge)}
                title="Anyone can trigger verification; validators review the code"
              >
                {busy ? "Reviewing…" : "Verify (validators review)"}
              </button>
            )}
            {!me && badge.attempts === 0 && (
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                Connect a wallet to trigger verification
              </span>
            )}
          </>
        )}
        {badge.verdict !== "PENDING" && (
          <span className="muted" style={{ fontSize: "0.82rem" }}>
            {badge.verdict === "VERIFIED"
              ? "Verified by validator consensus"
              : "Rejected by validator consensus"}
          </span>
        )}
      </div>
    </article>
  );
}