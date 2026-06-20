import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserCircle2 } from "lucide-react";
import type { TgAccountInfo } from "@/hooks/use-tg-accounts";

// Lets the user pick which connected Telegram account a page's jobs run as.
// Shows a live hint when an account already has a scrape/add or campaign running.
export function AccountSelector({
  accounts,
  accountId,
  onChange,
  label = "Run as account",
  className,
}: {
  accounts: TgAccountInfo[];
  accountId: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  // Show all connected accounts, plus the currently-selected one even if it has
  // momentarily dropped to disconnected (e.g. a Telegram reconnect mid-scrape) so
  // the dropdown never goes blank and snaps the selection to another account.
  const selectable = accounts.filter((a) => a.connected || a.id === accountId);
  if (selectable.length === 0) return null;

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <UserCircle2 className="w-3 h-3" /> {label}
      </Label>
      <Select value={accountId} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-run-account">
          <SelectValue placeholder="Select account…" />
        </SelectTrigger>
        <SelectContent>
          {selectable.map((a) => {
            const busy = a.addJob?.active ? "adding…" : a.campaign?.active ? "sending…" : null;
            const offline = !a.connected;
            return (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
                {a.username ? ` · @${a.username}` : ""}
                {busy ? ` · ${busy}` : offline ? " · reconnecting…" : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
