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
  const accountIds = accounts.map((a) => a.id).join(",");

  const [accountId, setAccountIdState] = useState<string>(() => localStorage.getItem(STORE_KEY) || "");

  // Keep the selection STICKY: only re-pick when the chosen account no longer
  // exists (removed) or nothing is selected yet. We deliberately do NOT reset
  // when the account merely drops to disconnected for a moment — a Telegram
  // reconnect during a heavy scrape would otherwise flip the run-account back to
  // another account mid-job, switching the add-status query and making the
  // running job appear to vanish. Prefer a connected account on first pick.
  useEffect(() => {
    if (!accounts.length) return;
    if (accountId && accounts.some((a) => a.id === accountId)) return;
    const fallback =
      accounts.find((a) => a.connected && a.active)?.id ||
      accounts.find((a) => a.connected)?.id ||
      accounts.find((a) => a.active)?.id ||
      accounts[0].id;
    setAccountIdState(fallback);
    localStorage.setItem(STORE_KEY, fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIds, accountId]);

  const setAccountId = (id: string) => {
    setAccountIdState(id);
    if (id) localStorage.setItem(STORE_KEY, id);
    else localStorage.removeItem(STORE_KEY);
  };

  const selected = accounts.find((a) => a.id === accountId) || null;

  return { status, accounts, connected, accountId, setAccountId, selected };
}
