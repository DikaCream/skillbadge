import { useCallback, useEffect, useMemo, useState } from "react";
import BadgeCard from "../components/BadgeCard";
import { useSkillBadge } from "../context/SkillBadgeContext";
import { timeAgo } from "../lib/client";
import type { Badge, Stats } from "../lib/types";

const POLL_MS = 10000;
type Filter = "all" | "verified" | "pending" | "rejected";
type SortKey = "newest" | "oldest" | "skill" | "holder";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "verified", label: "Verified" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
];

export default function Badges() {
  const { wallet, contract } = useSkillBadge();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [mine, setMine] = useState<Badge[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
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
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load badges.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [contract, wallet.address]);

  useEffect(() => {
    refresh();
    const poll = setInterval(() => refresh(true), POLL_MS);
    return () => clearInterval(poll);
  }, [refresh]);

  const runTx = useCallback(
    async (id: number, fn: () => Promise<string>) => {
      setBusyId(id);
      setError(null);
      try {
        const txHash = await fn();
        await contract.waitForReceipt(txHash);
        await refresh(true);
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

  // Counts by verdict, computed from the fetched list rather than the
  // contract's get_stats, whose pending/rejected fields are unreliable.
  const counts = useMemo(() => {
    const c = { total: badges.length, verified: 0, pending: 0, rejected: 0 };
    for (const b of badges) {
      if (b.verdict === "VERIFIED") c.verified++;
      else if (b.verdict === "REJECTED") c.rejected++;
      else c.pending++;
    }
    return c;
  }, [badges]);

  const matchesQuery = useCallback(
    (b: Badge) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const id = `#${b.id}`;
      return (
        b.skill.toLowerCase().includes(q) ||
        b.github_url.toLowerCase().includes(q) ||
        b.holder.toLowerCase().includes(q) ||
        b.note.toLowerCase().includes(q) ||
        (b.reason || "").toLowerCase().includes(q) ||
        id.includes(q)
      );
    },
    [query],
  );

  const sortBadges = useCallback(
    (list: Badge[]) => {
      const arr = [...list];
      if (sort === "newest") arr.sort((a, b) => b.id - a.id);
      else if (sort === "oldest") arr.sort((a, b) => a.id - b.id);
      else if (sort === "skill")
        arr.sort((a, b) => a.skill.localeCompare(b.skill) || b.id - a.id);
      else arr.sort((a, b) => a.holder.localeCompare(b.holder) || b.id - a.id);
      return arr;
    },
    [sort],
  );

  const applyFilter = useCallback(
    (list: Badge[]) =>
      list.filter(
        (b) =>
          filter === "all" ||
          (filter === "verified" && b.verdict === "VERIFIED") ||
          (filter === "pending" && b.verdict === "PENDING") ||
          (filter === "rejected" && b.verdict === "REJECTED"),
      ),
    [filter],
  );

  const visibleMine = useMemo(
    () => sortBadges(applyFilter(mine.filter(matchesQuery))),
    [mine, applyFilter, matchesQuery, sortBadges],
  );
  const visibleAll = useMemo(
    () => sortBadges(applyFilter(badges.filter(matchesQuery))),
    [badges, applyFilter, matchesQuery, sortBadges],
  );

  const pillCount = (key: Filter) =>
    key === "all" ? counts.total : counts[key];

  return (
    <div className="page container">
      <div className="page-head">
        <h1>Badges</h1>
        <p className="muted">
          Claimed skills judged by the validators. Trigger the review on any
          Pending badge; only evidence on the linked URL counts.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {stats && (
        <div className="stats-row" style={{ marginBottom: 26 }}>
          <div className="stat">
            <div className="stat-value">{counts.total}</div>
            <div className="stat-label">Total claims</div>
          </div>
          <div className="stat">
            <div className="stat-value blue">{counts.verified}</div>
            <div className="stat-label">Verified</div>
          </div>
          <div className="stat">
            <div className="stat-value warn">{counts.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat">
            <div className="stat-value red">{counts.rejected}</div>
            <div className="stat-label">Rejected</div>
          </div>
        </div>
      )}

      <div className="badges-toolbar">
        <div className="filter-pills" role="group" aria-label="Filter badges">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "active" : ""}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="pill-count">{pillCount(f.key)}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <input
            className="search-input"
            type="search"
            placeholder="Search skill, URL, address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search badges"
          />
          <select
            className="sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort badges"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="skill">Skill A–Z</option>
            <option value="holder">Claimant</option>
          </select>
          <button
            className="ghost small"
            onClick={() => refresh(true)}
            disabled={refreshing}
            title="Refresh from chain"
          >
            {refreshing ? "Updating…" : "Refresh"}
          </button>
        </div>
      </div>
      {lastUpdated && !loading && (
        <p className="toolbar-hint muted">
          {visibleAll.length} shown · updated {timeAgo(Math.floor(lastUpdated / 1000))}
        </p>
      )}

      {loading ? (
        <div className="page-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Loading badges…
        </div>
      ) : (
        <>
          {visibleMine.length > 0 && (
            <section style={{ marginBottom: 34 }}>
              <h2 className="section-title">
                Your claims{" "}
                <span className="accent">({visibleMine.length})</span>
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
            All badges <span className="accent">({counts.total})</span>
          </h2>
          {counts.total === 0 ? (
            <div className="empty">
              <p>No claims yet.</p>
              <p>
                <a href="/claim">Claim the first skill →</a>
              </p>
            </div>
          ) : visibleAll.length === 0 ? (
            <div className="empty">
              <p>No badges match that search or filter.</p>
              <p>
                <button
                  className="ghost"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters →
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