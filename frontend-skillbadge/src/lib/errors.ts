/**
 * Error handling for the GenLayer RPC + contract layer.
 *
 * genlayer-js surfaces failures in several shapes: network-level fetch errors,
 * contract reverts, and wallet rejections. This module maps them to a small
 * set of human-readable messages and adds bounded retry for read calls, whose
 * consensus round-trips are slow and occasionally drop a request.
 */

export type AppErrorKind = "network" | "contract" | "wallet" | "unknown";

export interface AppError {
  kind: AppErrorKind;
  title: string;
  detail: string;
  retryable: boolean;
}

const NETWORK_MARKERS = [
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network error",
  "networkrequest",
  "network request",
  "econnrefused",
  "econnreset",
  "etimedout",
  "timeout",
  "err_connection",
  "err_network",
  "load failed",
  "request failed",
  "http request error",
];

const WALLET_MARKERS = [
  "user rejected",
  "user denied",
  "rejected by user",
  "denied by user",
  "request rejected",
  "no injected wallet",
  "no accounts available",
  "connection cancelled",
  "request accounts",
];

/** Pull the first plausible reason line out of a viem/genlayer error chain. */
function extractReason(err: any): string {
  const candidates: string[] = [];
  const walk = (e: any): void => {
    if (!e) return;
    for (const key of ["shortMessage", "details", "message", "reason"]) {
      const v = e[key];
      if (typeof v === "string" && v.trim()) candidates.push(v.trim());
    }
    if (e.cause && e.cause !== e) walk(e.cause);
  };
  walk(err);

  for (const c of candidates) {
    // viem puts the revert text after "Error:" or inside quotes after "revert".
    const m = c.match(
      /(?:Error|Reason|reason):\s*([^\n]{3,}?)(?:\n|$)/i,
    ) ?? c.match(/"([^"]{3,})"/);
    if (m && m[1] && !/version: viem/i.test(m[1])) return m[1].trim();
    if (!/^version:/i.test(c) && !/^error:/i.test(c) && c.length < 400) return c;
  }
  return "";
}

export function describeError(err: unknown): AppError {
  const e = err as any;
  const message = String(e?.shortMessage || e?.message || e?.details || err || "")
    .toLowerCase();
  const reason = extractReason(e);

  if (WALLET_MARKERS.some((m) => message.includes(m))) {
    return {
      kind: "wallet",
      title: "Wallet connection needed",
      detail: reason || "Approve the request in your wallet to continue.",
      retryable: true,
    };
  }

  if (NETWORK_MARKERS.some((m) => message.includes(m)) || e?.name === "HttpRequestError") {
    return {
      kind: "network",
      title: "Can't reach the GenLayer network",
      detail:
        "The RPC endpoint did not answer. This is usually a momentary drop " +
        "on the network or your connection. Retry, and check that " +
        "studio.genlayer.com is reachable.",
      retryable: true,
    };
  }

  if (
    e?.name === "ContractFunctionExecutionError" ||
    e?.name === "TransactionExecutionError" ||
    /execution reverted|execution failed|contract function|missing or invalid parameters|invalid parameters/i.test(
      message,
    )
  ) {
    return {
      kind: "contract",
      title: "The contract refused the call",
      detail: reason || "The contract reverted. Check the values you entered.",
      retryable: false,
    };
  }

  return {
    kind: "unknown",
    title: "Something went wrong",
    detail: reason || "An unexpected error occurred. Try again.",
    retryable: true,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying transient network failures with backoff. Reads are
 * idempotent and safe to retry; writes should not go through this helper.
 */
export async function withReadRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 900,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const kind = describeError(err).kind;
      if (kind !== "network" || attempt === retries) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastErr;
}