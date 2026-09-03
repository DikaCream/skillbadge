/**
 * Evidence-URL smarts for the Claim form.
 *
 * The contract only accepts commit-pinned raw GitHub files: the validators
 * fetch each URL as rendered text, and a full commit SHA in the URL makes the
 * content immutable, so they judge exactly what was claimed. A repo landing
 * page renders as README + file listing (no code), and a branch-based URL can
 * change later, so neither is accepted. This module classifies what the user
 * pastes, rewrites /blob/ links into raw URLs, and resolves branch names to a
 * commit SHA through the GitHub API when the user did not copy a pinned link.
 */

export type UrlKind =
  | "empty"
  | "pinned-raw"
  | "unpinned-raw"
  | "blob"
  | "repo"
  | "tree"
  | "profile"
  | "page";

export interface ParsedRepoUrl {
  /** "raw" for raw.githubusercontent.com, "github" for github.com. */
  host: "raw" | "github";
  owner: string;
  repo: string;
  /** Branch, tag, or full commit SHA. */
  ref: string;
  /** File path, without the ref. */
  path: string;
}

export interface UrlInfo {
  kind: UrlKind;
  /** URL to submit (blob links are rewritten to raw; may still need pinning). */
  submitUrl: string;
  /** True when a commit SHA still has to be resolved via the GitHub API. */
  needsPin: boolean;
  note: string;
  warn: boolean;
}

const GITHUB_HOST_RE = /^(?:www\.)?github\.com$/i;
const RAW_HOST = "raw.githubusercontent.com";
const FULL_SHA_RE = /^[0-9a-f]{40}$/i;

/** Split an https URL into host + path segments, or null. */
function splitUrl(url: string): { host: string; segs: string[] } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const segs = u.pathname.split("/").filter(Boolean);
    return { host: u.hostname.toLowerCase(), segs };
  } catch {
    return null;
  }
}

/** Parse a GitHub (raw or regular) file URL into its parts. */
export function parseRepoUrl(url: string): ParsedRepoUrl | null {
  const split = splitUrl(url);
  if (!split) return null;
  if (split.host === RAW_HOST) {
    const [owner = "", repo = "", ref = "", ...path] = split.segs;
    if (!owner || !repo || !ref || path.length === 0) return null;
    return { host: "raw", owner, repo, ref, path: path.join("/") };
  }
  if (GITHUB_HOST_RE.test(split.host)) {
    const [owner = "", repo = "", kind, ref = "", ...path] = split.segs;
    if (!owner || !repo || kind !== "blob" || !ref || path.length === 0) return null;
    return { host: "github", owner, repo, ref, path: path.join("/") };
  }
  return null;
}

function rawUrl(owner: string, repo: string, ref: string, path: string): string {
  return `https://${RAW_HOST}/${owner}/${repo}/${ref}/${path}`;
}

/** Classify an evidence file URL and rewrite it when possible. */
export function describeEvidenceUrl(input: string): UrlInfo {
  const raw = input.trim();
  if (!raw) {
    return { kind: "empty", submitUrl: "", needsPin: false, note: "", warn: false };
  }

  const parsed = parseRepoUrl(raw);
  if (parsed) {
    if (parsed.host === "raw") {
      if (FULL_SHA_RE.test(parsed.ref)) {
        return {
          kind: "pinned-raw",
          submitUrl: raw,
          needsPin: false,
          note: "Pinned to one commit. Validators read this exact file version.",
          warn: false,
        };
      }
      return {
        kind: "unpinned-raw",
        submitUrl: raw,
        needsPin: true,
        note: "Raw file on a branch. We'll pin it to the current commit so the evidence can't change after claiming.",
        warn: false,
      };
    }
    // github.com/.../blob/<ref>/<path>
    if (FULL_SHA_RE.test(parsed.ref)) {
      return {
        kind: "pinned-raw",
        submitUrl: rawUrl(parsed.owner, parsed.repo, parsed.ref, parsed.path),
        needsPin: false,
        note: "Converts to a raw file pinned to one commit.",
        warn: false,
      };
    }
    return {
      kind: "blob",
      submitUrl: rawUrl(parsed.owner, parsed.repo, parsed.ref, parsed.path),
      needsPin: true,
      note: "We'll convert this to a raw file and pin it to the current commit.",
      warn: false,
    };
  }

  // Not a GitHub file URL. Give a precise reason it can't be evidence.
  const split = splitUrl(raw);
  if (split && split.host === RAW_HOST) {
    return {
      kind: "unpinned-raw",
      submitUrl: raw,
      needsPin: true,
      note: "That raw URL has no commit SHA. Add the full 40-character commit hash after the repo name.",
      warn: true,
    };
  }
  if (split && GITHUB_HOST_RE.test(split.host)) {
    const [, repo = "", ...rest] = split.segs;
    if (rest[0] === "tree") {
      return {
        kind: "tree",
        submitUrl: raw,
        needsPin: false,
        note: "A folder view fetches as README + file names only. Link a specific file instead.",
        warn: true,
      };
    }
    if (rest.length === 0 && repo) {
      return {
        kind: "repo",
        submitUrl: raw,
        needsPin: false,
        note: "A repo page fetches as README + file listing, not source code. Open the code file and copy its link.",
        warn: true,
      };
    }
    if (!repo) {
      return {
        kind: "profile",
        submitUrl: raw,
        needsPin: false,
        note: "A profile page fetches as an about page with repo names. Link a specific file instead.",
        warn: true,
      };
    }
  }
  return {
    kind: "page",
    submitUrl: raw,
    needsPin: false,
    note: "Validators read pages as text, but the contract only accepts raw GitHub files pinned to a commit.",
    warn: true,
  };
}

/** Checks specific to the owner-proof file. Returns note/warn pair. */
export function describeOwnerProofUrl(
  input: string,
  walletAddress: string | null,
  evidenceInfo?: UrlInfo | null,
): UrlInfo {
  const raw = input.trim();
  if (!raw) {
    return {
      kind: "empty",
      submitUrl: "",
      needsPin: false,
      note: walletAddress
        ? `Name the file ${walletAddress.slice(0, 10)}…<rest>.txt so validators can tie it to your wallet.`
        : "Connect your wallet to see the file name to use.",
      warn: false,
    };
  }

  const parsed = parseRepoUrl(raw);
  if (!parsed || parsed.host !== "raw") {
    return {
      kind: "page",
      submitUrl: raw,
      needsPin: false,
      note: "Owner proof must be a raw.githubusercontent.com file. Copy the raw link of your skillbadge-verify file.",
      warn: true,
    };
  }

  const lower = raw.toLowerCase();
  const walletOk =
    !!walletAddress && lower.includes(walletAddress.toLowerCase());

  const notes: string[] = [];
  let warn = false;

  if (!FULL_SHA_RE.test(parsed.ref)) {
    notes.push("not pinned to a commit yet");
    warn = true;
  }
  if (!walletOk) {
    notes.push("file name doesn't contain your wallet address");
    warn = true;
  }
  if (evidenceInfo && evidenceInfo.submitUrl) {
    const ev = parseRepoUrl(evidenceInfo.submitUrl);
    if (ev && ev.owner.toLowerCase() !== parsed.owner.toLowerCase()) {
      notes.push("owner proof and evidence must be in the same repository");
      warn = true;
    } else if (ev && ev.path.toLowerCase() === parsed.path.toLowerCase()) {
      notes.push("owner proof and evidence must be different files");
      warn = true;
    }
  }

  if (!warn) {
    return {
      kind: "pinned-raw",
      submitUrl: raw,
      needsPin: false,
      note: "Proof of repo control. Validators will fetch it and check it contains your wallet address.",
      warn: false,
    };
  }
  return {
    kind: parsed.ref && FULL_SHA_RE.test(parsed.ref) ? "pinned-raw" : "unpinned-raw",
    submitUrl: raw,
    needsPin: !FULL_SHA_RE.test(parsed.ref),
    note: `Fix before claiming: ${notes.join("; ")}.`,
    warn: true,
  };
}

/**
 * Resolve a branch/tag (or confirm a SHA) to a full commit SHA via the GitHub
 * API, returning the pinned raw URL. Throws with a readable message when the
 * repo or ref can't be resolved.
 */
export async function pinToCommit(
  parsed: ParsedRepoUrl,
  submitUrl: string,
): Promise<{ url: string; sha: string }> {
  if (FULL_SHA_RE.test(parsed.ref)) {
    return { url: submitUrl, sha: parsed.ref };
  }
  const res = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(parsed.ref)}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `GitHub can't find ${parsed.owner}/${parsed.repo}@${parsed.ref}. Check the URL and that the repo is public.`,
      );
    }
    throw new Error(
      `GitHub did not answer (${res.status}). Paste the full 40-character commit link instead.`,
    );
  }
  const data = await res.json();
  const sha = String(data?.sha ?? "");
  if (!FULL_SHA_RE.test(sha)) {
    throw new Error("GitHub returned no usable commit SHA. Paste the full commit link instead.");
  }
  return { url: rawUrl(parsed.owner, parsed.repo, sha, parsed.path), sha };
}

/** Short display of the rewritten URL for the preview line. */
export function shortUrl(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/\/+$/, "");
}