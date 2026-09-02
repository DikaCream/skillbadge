import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTruthBetsClient } from "../lib/client";
import { SkillBadge } from "../lib/contract";
import { useWallet } from "../hooks/useWallet";

interface SkillBadgeContextValue {
  wallet: ReturnType<typeof useWallet>;
  contract: SkillBadge;
}

const SkillBadgeContext = createContext<SkillBadgeContextValue | null>(null);

export function SkillBadgeProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const contract = useMemo(() => {
    const client = createTruthBetsClient(wallet.address);
    return new SkillBadge(client);
  }, [wallet.address]);

  return (
    <SkillBadgeContext.Provider value={{ wallet, contract }}>
      {children}
    </SkillBadgeContext.Provider>
  );
}

export function useSkillBadge(): SkillBadgeContextValue {
  const ctx = useContext(SkillBadgeContext);
  if (!ctx) {
    throw new Error("useSkillBadge must be used within a SkillBadgeProvider");
  }
  return ctx;
}