import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { History, Download, Trash2, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, SkipForward, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}
function duration(start: number, end: number) {
  const s = Math.round((end - start) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const STATUS_CFG: Record<string, { icon: any; color: string }> = {
  sent:        { icon: CheckCircle2,  color: "text-green-500" },
  no_telegram: { icon: XCircle,       color: "text-yellow-500" },
  error:       { icon: AlertTriangle, color: "text-red-500" },
  skipped:     { icon: SkipForward,   color: "text-muted-foreground" },
  flood_wait:  { icon: Clock,         color: "text-orange-500" },
};

export default function CampaignHistory() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-history"],
    queryFn: async () => {
      const r = await fetch("/api/campaign/history");
      return r.json();
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["campaign-history", expanded],
    queryFn: async () => {
      if (!expanded) return null;
      const r = await fetch(`/api/campaign/history/${expanded}`);
      return r.json();
    },
    enabled: !!expanded,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/campaign/history/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-history"] });
      toast({ title: "Deleted" });
    },
  });

  const exportCsv = (id: string) => {
    window.open(`/api/campaign/history/${id}/export.csv`, "_blank");
  };

  const items = data?.items || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="w-6 h-6" /> Campaign History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Past campaign runs with per-contact delivery records</p>
        </div>

        {isLoading && (
          <p className="text-center text-muted-foreground py-12">Loading history...</p>
        )}

        {!isLoading && items.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <History className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No campaigns run yet. Start one from the TG Campaign page.</p>
            </CardContent>
          </Card>
        )}

        {items.map((item: any) => {
          const isOpen = expanded === item.id;
          const filter = logFilter[item.id] || "all";
          const log: any[] = detail?.log && isOpen ? detail.log : [];
          const filteredLog = filter === "all" ? log : log.filter((e: any) => e.status === filter);
          const rate = item.total > 0 ? Math.round((item.sent / item.total) * 100) : 0;

          return (
            <Card key={item.id} className={cn("transition-colors", isOpen && "border-primary/30")}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs shrink-0">{rate}% delivered</Badge>
                      <span className="text-xs text-muted-foreground">{fmt(item.startTime)}</span>
                      {item.endTime && item.startTime && (
                        <span className="text-xs text-muted-foreground">· {duration(item.startTime, item.endTime)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 truncate font-mono">{item.message || "—"}</p>
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-green-500 font-medium">✓ {item.sent} sent</span>
                      <span className="text-yellow-500">✗ {item.noTelegram} no TG</span>
                      <span className="text-red-500">⚠ {item.failed} error</span>
                      {item.skipped > 0 && <span className="text-muted-foreground">⏭ {item.skipped} skipped</span>}
                      <span className="text-muted-foreground">/ {item.total} total</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => exportCsv(item.id)}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => del.mutate(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => setExpanded(isOpen ? null : item.id)}
                    >
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="p-0 border-t border-border">
                  <div className="flex gap-1.5 flex-wrap p-3 pb-2">
                    {["all", "sent", "no_telegram", "error", "skipped"].map(f => (
                      <button
                        key={f}
                        onClick={() => setLogFilter(p => ({ ...p, [item.id]: f }))}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs border transition-colors",
                          filter === f
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {f === "all" ? `All (${log.length})` :
                         f === "sent" ? `Sent (${log.filter((e: any) => e.status === "sent").length})` :
                         f === "no_telegram" ? `No TG (${log.filter((e: any) => e.status === "no_telegram").length})` :
                         f === "error" ? `Error (${log.filter((e: any) => e.status === "error").length})` :
                         `Skipped (${log.filter((e: any) => e.status === "skipped").length})`}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border">
                    {filteredLog.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">No entries</p>
                    )}
                    {filteredLog.map((entry: any, i: number) => {
                      const cfg = STATUS_CFG[entry.status] || STATUS_CFG.error;
                      const Icon = cfg.icon;
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30">
                          <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-foreground">{entry.phone}</p>
                            {entry.name && entry.name !== entry.phone && (
                              <p className="text-xs text-muted-foreground">{entry.name}</p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground shrink-0">
                            <p className={cfg.color}>{entry.status}</p>
                            {entry.error && <p className="truncate max-w-[100px]">{entry.error}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 border-t border-border">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => exportCsv(item.id)}>
                      <Download className="w-3.5 h-3.5 mr-2" /> Export CSV
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
