import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ErrorBanner from "../components/ErrorBanner";
import { useSkillBadge } from "../context/SkillBadgeContext";
import { formatAddress } from "../lib/client";
import type { Badge, Stats } from "../lib/types";
import { TierChip } from "../components/StatusBadge";

export default function Home() {
  const { contract } = useSkillBadge();
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<Badge[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setRetrying(true);
    try {
      const [s, t] = await Promise.all([
        contract.getStats(),
        contract.getLeaderboard(5),
      ]);
      setStats(s);
      setTop(t);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setRetrying(false);
    }
  }, [contract]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      {error && (
        <div className="container">
          <ErrorBanner error={error} onRetry={load} retrying={retrying} />
        </div>
      )}

      <section className="hero">
        <div className="container">
          <span className="eyebrow">
            <span className="pulse" /> Live on GenLayer StudioNet
          </span>
          <h1>
            Your code,
            <br />
            <span className="grad">judged by the network.</span>
          </h1>
          <p className="lede">
            Point at a public repo and name a skill. GenLayer's validators
            fetch the code, review it, and issue a badge: bronze, silver, or
            gold. If the evidence doesn't hold up, the claim is rejected with
            a reason.
          </p>
          <div className="hero-cta">
            <Link to="/badges" className="primary">
              Browse badges
            </Link>
            <Link to="/claim" className="ghost">
              Claim a skill
            </Link>
          </div>
          <div className="stats-row">
            <div className="stat">
              <div className="stat-value">{stats?.total_claims ?? "—"}</div>
              <div className="stat-label">Claims on-chain</div>
            </div>
            <div className="stat">
              <div className="stat-value blue">{stats?.verified ?? "—"}</div>
              <div className="stat-label">Verified</div>
            </div>
            <div className="stat">
              <div className="stat-value gold">3</div>
              <div className="stat-label">Tiers</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">
            How it <span className="accent">works</span>
          </h2>
          <div className="steps">
            <div className="step">
              <div className="step-n">STEP 01</div>
              <h3>Claim a skill</h3>
              <p>
                Submit a public GitHub URL (a profile or a specific repo) plus
                the skill you want judged. It's free and gasless.
              </p>
            </div>
            <div className="step">
              <div className="step-n">STEP 02</div>
              <h3>Validators review</h3>
              <p>
                Anyone can trigger verification. The validators fetch the URL
                and read the actual code and projects behind the claim.
              </p>
            </div>
            <div className="step">
              <div className="step-n">STEP 03</div>
              <h3>Badge issued</h3>
              <p>
                VERIFIED earns bronze, silver, or gold. REJECTED comes with a
                reason, and a rejected claim can be tried again later with
                better evidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <h2 className="section-title">
            Top <span className="accent">developers</span>
          </h2>
          {top.length === 0 ? (
            <p className="muted">
              No verified badges yet. Claim the first one.
            </p>
          ) : (
            <div className="leaderboard">
              {top.map((b) => (
                <div className="leader-row" key={b.id}>
                  <span className="lb-rank">#{b.rank}</span>
                  <div className="lb-who">
                    <span className="lb-skill">{b.skill}</span>
                    <span className="lb-holder">{formatAddress(b.holder)}</span>
                  </div>
                  <TierChip tier={b.tier} />
                </div>
              ))}
            </div>
          )}
          <div className="cta-band">
            <Link to="/claim" className="primary">
              Get yourself on the board →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}