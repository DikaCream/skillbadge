import { useCallback, useEffect, useMemo, useState } from "react";
import BadgeCard from "../components/BadgeCard";
import { useSkillBadge } from "../context/SkillBadgeContext";
import type { Badge, Stats } from "../lib/types";

const POLL_MS = 10000;
type Filter = "all" | "verified";

export default function Badges() {
  const { wallet, contract } = useSkillBadge();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [mine, setMine] = useState<Badge[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    try {
      const [all, s, my] = await Promise.all([
        contract.listBadges(0, 50),
        contract.getStats(),
        wallet.address
          ? contract.listClaimsByUser(wallet.address, 0, 50)
          : Promise.resolve([] as Badge[]),
      ]);
      setBadges(all);
      setStats(s);
      setMine(my);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load badges.");
    } finally {
      setLoading(false);
    }
  }, [contract, wallet.address]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [refresh]);

  const runTx = useCallback(
    async (id: number, fn: () => Promise<string>) => {
      setBusyId(id);
      setError(null);
      try {
        const txHash = await fn();
        await contract.waitForReceipt(txHash);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transaction failed.");
      } finally {
        setBusyId(null);
      }
    },
    [contract, refresh],
  );

  const onVerify = useCallback(
    (badge: Badge) => runTx(badge.id, () => contract.verifyBadge(badge.id)),
    [contract, runTx],
  );

  const applyFilter = useCallback(
    (list: Badge[]) =>
      filter === "verified" ? list.filter((b) => b.verdict === "VERIFIED") : list,
    [filter],
  );
  const visibleMine = useMemo(() => applyFilter(mine), [applyFilter, mine]);
  const visibleAll = useMemo(() => applyFilter(badges), [applyFilter, badges]);

  return (
    <div className="page container">
      <div className="page-head">
        <h1>Badges</h1>
        <p className="muted">
          Every claim on this contract. A <strong>Pending</strong> badge turns
          <strong> Verified</strong> (with a tier) or <strong>Rejected</strong>{" "}
          once the validators review the repo; anyone can trigger the review.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {stats && (
        <div className="stats-row" style={{ marginBottom: 26 }}>
          <div className="stat">
            <div className="stat-value">{stats.total_claims}</div>
            <div className="stat-label">Total claims</div>
          </div>
          <div className="stat">
            <div className="stat-value blue">{stats.verified}</div>
            <div className="stat-label">Verified</div>
          </div>
        </div>
      )}

      <div className="filter-pills" role="group" aria-label="Filter badges">
        <button
          className={filter === "all" ? "active" : ""}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={filter === "verified" ? "active" : ""}
          aria-pressed={filter === "verified"}
          onClick={() => setFilter("verified")}
        >
          Verified
        </button>
      </div>

      {loading ? (
        <div className="page-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading badges…
        </div>
      ) : (
        <>
          {visibleMine.length > 0 && (
            <section style={{ marginBottom: 34 }}>
              <h2 className="section-title">
                Your claims <span className="accent">({visibleMine.length})</span>
              </h2>
              <div className="grid">
                {visibleMine.map((b) => (
                  <BadgeCard
                    key={b.id}
                    badge={b}
                    me={wallet.address}
                    busy={busyId === b.id}
                    onVerify={onVerify}
                  />
                ))}
              </div>
            </section>
          )}

          <h2 className="section-title">
            All badges <span className="accent">({badges.length})</span>
          </h2>
          {badges.length === 0 ? (
            <div className="empty">
              <p>No claims yet.</p>
              <p>
                <a href="/claim">Claim the first skill →</a>
              </p>
            </div>
          ) : visibleAll.length === 0 ? (
            <div className="empty">
              <p>Nothing verified yet.</p>
              <p>
                <button className="ghost" onClick={() => setFilter("all")}>
                  Show all claims →
                </button>
              </p>
            </div>
          ) : (
            <div className="grid">
              {visibleAll.map((b) => (
                <BadgeCard
                  key={b.id}
                  badge={b}
                  me={wallet.address}
                  busy={busyId === b.id}
                  onVerify={onVerify}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}