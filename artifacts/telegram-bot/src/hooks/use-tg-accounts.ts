import { useEffect, useMemo, useState } from "react";
import { useGetBotStatus } from "@workspace/api-client-react";

// Per-account info exposed by /bot/status (and /tg-accounts). Each connected
// account runs its own scrape/add/campaign jobs concurrently, so the UI lets
// the user pick which account a given action runs as.
export interface TgAccountInfo {
  id: string;
  label: string;
  username: string | null;
  phone: string | null;
  name: string | null;
  hasOwnCreds: boolean;
  hasSession: boolean;
  active: boolean;
  connected: boolean;
  loginState: string;
  loginError: string | null;
  pendingLogin: boolean;
  addJob?: { active?: boolean } & Record<string, any>;
  campaign?: { active?: boolean } & Record<string, any>;
}

const STORE_KEY = "mfg_run_account";

// Tracks which connected account the current page runs jobs as. The selection
// persists in localStorage and self-heals when the chosen account disconnects.
export function useRunAccount(refetchInterval = 3000) {
  const { data: status } = useGetBotStatus({ query: { refetchInterval } });
  const accounts: TgAccountInfo[] = ((status as any)?.accounts as TgAccountInfo[]) || [];
  const connected = useMemo(() => accounts.filter((a) => a.connected), [accounts]);
  const connectedIds = connected.map((a) => a.id).join(",");

  const [accountId, setAccountIdState] = useState<string>(() => localStorage.getItem(STORE_KEY) || "");

  // Keep the selection valid: if the stored account isn't connected, fall back
  // to the active account, else the first connected one.
  useEffect(() => {
    if (!connected.length) return;
    if (connected.some((a) => a.id === accountId)) return;
    const fallback = connected.find((a) => a.active)?.id || connected[0].id;
    setAccountIdState(fallback);
    localStorage.setItem(STORE_KEY, fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedIds, accountId]);

  const setAccountId = (id: string) => {
    setAccountIdState(id);
    if (id) localStorage.setItem(STORE_KEY, id);
    else localStorage.removeItem(STORE_KEY);
  };

  const selected = accounts.find((a) => a.id === accountId) || null;

  return { status, accounts, connected, accountId, setAccountId, selected };
}
