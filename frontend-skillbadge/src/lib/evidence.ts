/**
 * Evidence-URL smarts for the Claim form.
 *
 * The contract fetches evidence with `gl.nondet.web.render(url, mode="text")`,
 * i.e. validators read the page as rendered TEXT. For a GitHub repo landing
 * page that means README + file listing, not source code. Pointing at a raw
 * file — or a /blob/ link, which we rewrite here — gives them the code itself.
 */

export type EvidenceKind = "raw" | "blob" | "repo" | "tree" | "profile" | "page";

export interface EvidenceInfo {
  kind: EvidenceKind | "empty";
  /** URL to actually submit (rewritten when possible). */
  submitUrl: string;
  /** One-line hint shown under the field. */
  note: string;
  /** True when the hint is a warning, false when it is good news. */
  warn: boolean;
}

const GITHUB_HOST = "github.com";
const RAW_HOST = "raw.githubusercontent.com";
const GITHUB_RE = /^(?:www\.)?github\.com$/i;

function hosted(url: string): { host: string; path: string[] } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (GITHUB_RE.test(u.hostname)) {
      const path = u.pathname.split("/").filter(Boolean);
      return { host: GITHUB_HOST, path };
    }
    if (u.hostname.toLowerCase() === RAW_HOST) {
      return { host: RAW_HOST, path: u.pathname.split("/").filter(Boolean) };
    }
    return null;
  } catch {
    return null;
  }
}

function rawUrl(owner: string, repo: string, refPath: string[]): string {
  return `https://${RAW_HOST}/${owner}/${repo}/${refPath.join("/")}`;
}

/**
 * Classify an evidence URL and, when we can, rewrite it to one validators can
 * actually read as source code. Empty input returns kind "empty".
 */
export function describeEvidenceUrl(input: string): EvidenceInfo {
  const raw = input.trim();

  if (!raw) {
    return { kind: "empty", submitUrl: "", note: "", warn: false };
  }

  const gh = hosted(raw);
  if (!gh) {
    return {
      kind: "page",
      submitUrl: raw,
      note: "Validators read any page as plain text. If it is a GitHub repo, link a file instead of the landing page.",
      warn: false,
    };
  }

  // raw.githubusercontent.com/<owner>/<repo>/<ref>/<path> — already ideal.
  if (gh.host === RAW_HOST) {
    return {
      kind: "raw",
      submitUrl: raw,
      note: "Raw file — validators read the actual source code. Ideal evidence.",
      warn: false,
    };
  }

  const [owner = "", repo = "", ...rest] = gh.path;

  // github.com/<owner>/<repo>/blob/<ref>/<path> -> raw.githubusercontent URL.
  if (rest[0] === "blob") {
    const refPath = rest.slice(1);
    if (refPath.length >= 2) {
      const rewritten = rawUrl(owner, repo, refPath);
      return {
        kind: "blob",
        submitUrl: rewritten,
        note: "Converts to a raw file so validators read the code itself.",
        warn: false,
      };
    }
    return {
      kind: "blob",
      submitUrl: raw,
      note: "This /blob/ link has no file path yet. Open a file on GitHub and copy its link.",
      warn: true,
    };
  }

  // github.com/<owner>/<repo>/tree/<ref> — a folder view: README + listing only.
  if (rest[0] === "tree") {
    return {
      kind: "tree",
      submitUrl: raw,
      note: "A folder view fetches as README + file names only. Link a specific file instead.",
      warn: true,
    };
  }

  // github.com/<owner>/<repo> — repo landing page.
  if (rest.length === 0 && repo) {
    return {
      kind: "repo",
      submitUrl: raw,
      note: "A repo page fetches as README + file listing, not source code. Link a file to let validators verify the code itself.",
      warn: true,
    };
  }

  // github.com/<owner> — profile page.
  if (!repo) {
    return {
      kind: "profile",
      submitUrl: raw,
      note: "A profile page fetches as an about page with repo names. Link a specific file or repo instead.",
      warn: true,
    };
  }

  return {
    kind: "page",
    submitUrl: raw,
    note: "Validators read this page as rendered text.",
    warn: false,
  };
}

/** Short display of the rewritten URL for the preview line. */
export function shortUrl(url: string): string {
  return url.replace(/^https:\/\//, "").replace(/\/+$/, "");
}