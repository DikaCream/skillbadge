/**
 * Frontend configuration.
 *
 * VITE_CONTRACT_ADDRESS — the deployed SkillBadge contract address.
 * VITE_GENLAYER_NETWORK  — studionet (default) | testnet-asimov | localnet.
 * VITE_GENLAYER_RPC_URL  — optional RPC endpoint override.
 */

function env(name: string, fallback: string): string {
  const value = import.meta.env[name] as string | undefined;
  return (value && value.trim()) || fallback;
}

// Live SkillBadge deployment on StudioNet.
export const CONTRACT_ADDRESS = env(
  "VITE_CONTRACT_ADDRESS",
  "0xde308783bDB67467cb94f4De6d9Bf65e73C0A321",
);

export const NETWORK = env("VITE_GENLAYER_NETWORK", "studionet");

export const RPC_URL = env("VITE_GENLAYER_RPC_URL", "https://studio.genlayer.com/api");

export const STUDIONET_CHAIN_ID = 61999;
export const STUDIONET_CHAIN_ID_HEX = "0xF23F";

// Contract constraints surfaced by get_stats, used for form hints.
export const MAX_CLAIMS_PER_USER = 10;
export const MIN_SKILL_CHARS = 2;
export const MAX_SKILL_CHARS = 40;
export const MAX_NOTE_CHARS = 300;