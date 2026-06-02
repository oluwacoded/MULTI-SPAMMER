import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost, apiUrl, apiDelete } from "@/lib/api";
import {
  MessageCircle, Send, Square, Users, Upload, QrCode, Loader2, CheckCircle2,
  XCircle, Info, LogOut, Smartphone, History, Clock, Download, Trash2, RefreshCw
} from "lucide-react";

interface WaContact { phone: string; name: string; }

function parsePhones(text: string): WaContact[] {
  const out: WaContact[] = [];
  for (const line of text.split(/[\n,;]+/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/[\t,]/).map(s => s.trim());
    const phoneRaw = parts.find(p => /\d{6,}/.test(p)) || parts[0];
    let phone = phoneRaw.replace(/[^\d+]/g, "");
    if (phone.length < 7) continue;
    const name = parts.find(p => p !== phoneRaw && !/^\+?\d+$/.test(p)) || "";
    out.push({ phone, name });
  }
  const seen = new Set<string>();
  return out.filter(c => { if (seen.has(c.phone)) return false; seen.add(c.phone); return true; });
}

function parseVCF(text: string): WaContact[] {
  const out: WaContact[] = [];
  for (const card of text.split(/END:VCARD/i)) {
    const nameM = card.match(/FN:(.*)/i);
    const phoneM = card.match(/TEL[^:]*:([\d+\s\-().]+)/i);
    if (phoneM) {
      const phone = phoneM[1].replace(/[^\d+]/g, "");
      if (phone.length >= 7) out.push({ phone, name: nameM ? nameM[1].trim() : "" });
    }
  }
  return out;
}

export default function WhatsApp() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("Hi {name}! 👋");
  const [minDelay, setMinDelay] = useState(4);
  const [maxDelay, setMaxDelay] = useState(10);
  const [showLog, setShowLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: status } = useQuery({
    queryKey: ["wa-status"],
    queryFn: () => apiGet("/whatsapp/status"),
    refetchInterval: 2500,
  });
  const { data: histData } = useQuery({ queryKey: ["wa-history"], queryFn: () => apiGet("/whatsapp/history"), enabled: showHistory });

  const connected = !!status?.connected;
  const connecting = !!status?.connecting;
  const qr = status?.qr;
  const campaign = status?.campaign || { active: false };

  const connect = useMutation({
    mutationFn: () => apiPost("/whatsapp/connect"),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ["wa-status"] }); if (!res.ok) toast({ title: "Failed", description: res.message, variant: "destructive" }); },
  });
  const logout = useMutation({
    mutationFn: () => apiPost("/whatsapp/logout"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-status"] }); toast({ title: "Logged out of WhatsApp" }); },
  });
  const start = useMutation({
    mutationFn: () => apiPost("/whatsapp/campaign/start", { contacts, message, minDelay, maxDelay }),
    onSuccess: (res: any) => {
      if (res.ok) { setShowLog(true); qc.invalidateQueries({ queryKey: ["wa-status"] }); toast({ title: "Campaign started", description: `Messaging ${contacts.length} numbers` }); }
      else toast({ title: "Couldn't start", description: res.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });
  const stop = useMutation({
    mutationFn: () => apiPost("/whatsapp/campaign/stop"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-status"] }); toast({ title: "Stopped" }); },
  });
  const deleteHist = useMutation({
    mutationFn: (id: string) => apiDelete(`/whatsapp/history/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-history"] }); },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = file.name.endsWith(".vcf") ? parseVCF(text) : parsePhones(text);
      setContacts(parsed);
      toast({ title: `Loaded ${parsed.length} numbers`, description: file.name });
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    const parsed = parsePhones(rawInput);
    setContacts(parsed);
    toast({ title: parsed.length ? `Parsed ${parsed.length} numbers` : "No valid numbers found", variant: parsed.length ? undefined : "destructive" });
  };

  const log: any[] = campaign.log || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect via QR and send bulk WhatsApp messages</p>
        </div>

        {/* Connection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Smartphone className="w-4 h-4" /> Connection</CardTitle>
            <CardDescription>Link your WhatsApp account by scanning a QR code (like WhatsApp Web)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connected ? (
              <div className="flex items-center gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Connected</p>
                  {status?.me?.name && <p className="text-xs text-muted-foreground truncate">{status.me.name}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                </Button>
              </div>
            ) : qr ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="bg-white p-3 rounded-lg"><img src={qr} alt="WhatsApp QR" className="w-56 h-56" /></div>
                <p className="text-sm text-foreground font-medium">Scan with WhatsApp</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">Open WhatsApp → Settings → Linked Devices → Link a Device, then scan this code.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                  <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">Click connect to generate a QR code. Keep this tab open while sending — messages go through your linked phone.</p>
                </div>
                <Button className="w-full" onClick={() => connect.mutate()} disabled={connecting || connect.isPending}>
                  {connecting || connect.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                  {connecting ? "Generating QR…" : "Connect WhatsApp"}
                </Button>
                {status?.lastError && <p className="text-xs text-red-400">{status.lastError}</p>}
              </div>
            )}
            {connecting && qr && (
              <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => connect.mutate()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> QR expired? Refresh
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Active campaign */}
        {campaign.active && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><p className="text-sm font-semibold">Sending…</p></div>
                <Badge>{campaign.percent ?? 0}%</Badge>
              </div>
              <Progress value={campaign.percent ?? 0} className="h-2" />
              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div className="rounded-md bg-green-500/10 border border-green-500/20 p-1.5"><p className="font-bold text-green-400">{campaign.sent ?? 0}</p><p className="text-muted-foreground">Sent</p></div>
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-1.5"><p className="font-bold text-yellow-400">{campaign.noWhatsapp ?? 0}</p><p className="text-muted-foreground">No WA</p></div>
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-1.5"><p className="font-bold text-red-400">{campaign.failed ?? 0}</p><p className="text-muted-foreground">Failed</p></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowLog(v => !v)}>{showLog ? "Hide log" : "Show log"}</Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={() => stop.mutate()}><Square className="w-3.5 h-3.5 mr-1.5" /> Stop</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(showLog || (!campaign.active && log.length > 0)) && log.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Delivery log</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {log.slice().reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2">
                    {e.status === "sent" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      : e.status === "pending" ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                      : e.status === "no_whatsapp" ? <XCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    <div className="flex-1 min-w-0"><p className="text-xs font-mono text-foreground truncate">{e.phone}</p>{e.name && <p className="text-xs text-muted-foreground truncate">{e.name}</p>}</div>
                    <span className="text-xs text-muted-foreground shrink-0">{e.status === "no_whatsapp" ? "No WA" : e.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recipients */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Recipients</CardTitle>
            <CardDescription>Upload VCF/CSV or paste phone numbers with country code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept=".vcf,.csv,.txt" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1.5" /> Upload file</Button>
            <Textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder={"+12025550123\n+447911123456, Jane"} className="font-mono text-xs h-20 resize-none" />
            <Button size="sm" variant="secondary" onClick={handleParse}>Parse numbers</Button>
            {contacts.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/20">
                <Users className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-green-500 font-medium">{contacts.length} numbers</p>
                <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setContacts([])}>Clear</button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Message</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={message} onChange={e => setMessage(e.target.value)} className="h-28 resize-none" placeholder="Your message…" />
            <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{name}"}</code> and <code className="bg-muted px-1 rounded">{"{phone}"}</code> for personalisation.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Min delay (sec)</Label><Input type="number" min={0} value={minDelay} onChange={e => setMinDelay(parseInt(e.target.value) || 0)} className="mt-1 h-8" /></div>
              <div><Label className="text-xs text-muted-foreground">Max delay (sec)</Label><Input type="number" min={0} value={maxDelay} onChange={e => setMaxDelay(parseInt(e.target.value) || 0)} className="mt-1 h-8" /></div>
            </div>
            <Button className="w-full" disabled={!connected || !contacts.length || !message.trim() || campaign.active || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send to {contacts.length} number{contacts.length !== 1 ? "s" : ""}
            </Button>
            {!connected && <p className="text-xs text-muted-foreground text-center">Connect WhatsApp above to enable sending.</p>}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowHistory(v => !v)}>
            <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Campaign history</CardTitle>
          </CardHeader>
          {showHistory && (
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(histData?.items || []).length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No past campaigns</p>}
                {(histData?.items || []).map((h: any) => (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{h.message || "(message)"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(h.startTime).toLocaleString()} · {h.sent}/{h.total} sent · {h.noWhatsapp} no WA · {h.failed} failed</p>
                    </div>
                    <a href={apiUrl(`/whatsapp/history/${h.id}/export.csv`)} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button>
                    </a>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => deleteHist.mutate(h.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </Layout>
  );
}
