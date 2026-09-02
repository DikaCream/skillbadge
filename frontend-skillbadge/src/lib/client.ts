import { createClient } from "genlayer-js";
import { studionet, localnet } from "genlayer-js/chains";
import {
  NETWORK,
  RPC_URL,
  STUDIONET_CHAIN_ID,
  STUDIONET_CHAIN_ID_HEX,
} from "../config";

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function getChain(): any {
  if (NETWORK === "localnet") return localnet;
  // studionet is the default; testnet names fall back to studionet config but
  // with a different endpoint set via RPC_URL.
  return studionet;
}

/**
 * Create a genlayer-js client. When `address` is provided the client signs
 * transactions through the injected provider (window.ethereum).
 */
export function createTruthBetsClient(address?: string | null) {
  const config: any = { chain: getChain() };
  if (address) config.account = address as `0x${string}`;
  if (RPC_URL) config.endpoint = RPC_URL;
  return createClient(config) as any;
}

export function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

export function hasEthereumProvider(): boolean {
  return !!getProvider();
}

export async function requestAccounts(): Promise<string[]> {
  const provider = getProvider();
  if (!provider) throw new Error("No injected wallet found. Install MetaMask.");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts;
}

export async function getAccounts(): Promise<string[]> {
  const provider = getProvider();
  if (!provider) return [];
  try {
    return (await provider.request({ method: "eth_accounts" })) as string[];
  } catch {
    return [];
  }
}

/** Native GEN balance of an address, in wei. */
export async function getBalance(address: string): Promise<bigint> {
  const provider = getProvider();
  if (!provider) return 0n;
  try {
    const result = await provider.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    });
    return BigInt(result as string);
  } catch {
    return 0n;
  }
}

export async function getChainId(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    return (await provider.request({ method: "eth_chainId" })) as string;
  } catch {
    return null;
  }
}

/** Subscribe to wallet account changes. Returns an unsubscribe function. */
export function onAccountsChanged(
  handler: (accounts: string[]) => void,
): () => void {
  const provider = getProvider();
  if (!provider?.on) return () => {};
  provider.on("accountsChanged", handler as (...args: unknown[]) => void);
  return () =>
    provider.removeListener?.(
      "accountsChanged",
      handler as (...args: unknown[]) => void,
    );
}

/** Subscribe to network changes. Returns an unsubscribe function. */
export function onChainChanged(handler: (chainId: string) => void): () => void {
  const provider = getProvider();
  if (!provider?.on) return () => {};
  provider.on("chainChanged", handler as (...args: unknown[]) => void);
  return () =>
    provider.removeListener?.(
      "chainChanged",
      handler as (...args: unknown[]) => void,
    );
}

async function addStudionet(provider: EthereumProvider) {
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: STUDIONET_CHAIN_ID_HEX,
        chainName: "GenLayer Studio",
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: [],
      },
    ],
  });
}

async function switchToStudionet(provider: EthereumProvider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    if (err?.code === 4902) await addStudionet(provider);
    else throw err;
  }
}

async function ensureNetwork(provider: EthereumProvider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  const current = parseInt(chainId, 16);
  if (current !== STUDIONET_CHAIN_ID) {
    await switchToStudionet(provider);
  }
}

/**
 * Connect the injected wallet and ensure it is on the GenLayer network.
 * Returns the active address.
 */
export async function connectWallet(): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("No injected wallet found. Install MetaMask.");

  const accounts = await requestAccounts();
  if (!accounts.length) throw new Error("No accounts available.");

  try {
    await ensureNetwork(provider);
  } catch (err: any) {
    if (err?.code === 4001) throw new Error("Connection cancelled.");
    // Network switching can fail on some wallets; proceed on studionet default.
    console.warn("Could not switch network:", err);
  }
  return accounts[0];
}

export function formatAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Format a unix-seconds timestamp as a short date ("Sep 1, 2026"). 0 -> "—". */
export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Relative time like "2h ago". 0 -> "—". */
export function timeAgo(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/** Format a millisecond duration as m:ss for cooldown countdowns. */
export function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const GEN_DECIMALS = 18n;
const GEN_ONE = 10n ** GEN_DECIMALS;

/** Parse a decimal GEN string (e.g. "100" or "12.5") into wei, exactly. */
export function parseGen(input: string): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error("Invalid GEN amount");
  }
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(Number(GEN_DECIMALS))).slice(
    0,
    Number(GEN_DECIMALS),
  );
  return BigInt(whole) * GEN_ONE + BigInt(fracPadded || "0");
}

/** Format a wei amount as a human-readable GEN string. */
export function formatGen(wei: bigint | string | number): string {
  const w = BigInt(wei);
  const sign = w < 0n ? "-" : "";
  const abs = w < 0n ? -w : w;
  const whole = abs / GEN_ONE;
  const frac = (abs % GEN_ONE)
    .toString()
    .padStart(Number(GEN_DECIMALS), "0")
    .replace(/0+$/, "");
  return `${sign}${whole.toLocaleString()}${frac ? "." + frac : ""} GEN`;
}
