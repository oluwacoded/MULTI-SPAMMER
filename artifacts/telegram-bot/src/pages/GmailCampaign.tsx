import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost, apiFetch, apiUrl } from "@/lib/api";
import {
  Mail, Send, Square, Users, Upload, Settings2, CheckCircle2, XCircle, Loader2,
  Eye, Code, Wand2, Save, FileText, Info, Trash2, Download, History, Clock, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailContact { email: string; name: string; }

function parseEmails(text: string): EmailContact[] {
  const out: EmailContact[] = [];
  for (const line of text.split(/[\n,;]+/)) {
    const t = line.trim();
    if (!t) continue;
    // Support "Name <email>" or "email,name" or just "email"
    const angle = t.match(/^(.*?)<([^>]+)>$/);
    if (angle && /\S+@\S+\.\S+/.test(angle[2])) {
      out.push({ email: angle[2].trim(), name: angle[1].trim().replace(/^["']|["']$/g, "") });
      continue;
    }
    const parts = t.split(/[\t,]/).map(s => s.trim());
    const email = parts.find(p => /\S+@\S+\.\S+/.test(p));
    if (email) {
      const name = parts.find(p => p !== email) || "";
      out.push({ email, name });
    }
  }
  // dedupe by email
  const seen = new Set<string>();
  return out.filter(c => { const k = c.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

interface Block { id: string; type: "heading" | "text" | "button" | "image" | "divider"; content: string; url?: string; }

function blocksToHtml(blocks: Block[], accent: string): string {
  const parts = blocks.map(b => {
    switch (b.type) {
      case "heading":
        return `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">${escapeHtml(b.content)}</h1>`;
      case "text":
        return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(b.content).replace(/\n/g, "<br/>")}</p>`;
      case "button":
        return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-radius:6px;background:${accent};"><a href="${escapeAttr(b.url || "#")}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(b.content)}</a></td></tr></table>`;
      case "image":
        return `<img src="${escapeAttr(b.content)}" alt="" style="max-width:100%;border-radius:6px;margin:0 0 16px;display:block;"/>`;
      case "divider":
        return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>`;
      default:
        return "";
    }
  });
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<tr><td>${parts.join("\n")}</td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttr(s: string) { return s.replace(/"/g, "&quot;"); }

const newBlock = (type: Block["type"]): Block => ({
  id: Math.random().toString(36).slice(2),
  type,
  content: type === "heading" ? "Your headline" : type === "text" ? "Write your message here…" : type === "button" ? "Click here" : type === "image" ? "https://" : "",
  url: type === "button" ? "https://" : undefined,
});

export default function GmailCampaign() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [showPreview, setShowPreview] = useState(true);
  const [subject, setSubject] = useState("Hello {name}!");
  const [accent, setAccent] = useState("#2563eb");
  const [blocks, setBlocks] = useState<Block[]>([
    newBlock("heading"),
    newBlock("text"),
    newBlock("button"),
  ]);
  const [rawHtml, setRawHtml] = useState("<h1>Hello {name}!</h1>\n<p>Write your HTML email here.</p>");

  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [rawInput, setRawInput] = useState("");
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(8);

  const [configDialog, setConfigDialog] = useState(false);
  const [cfgEmail, setCfgEmail] = useState("");
  const [cfgPassword, setCfgPassword] = useState("");
  const [cfgFromName, setCfgFromName] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [saveTplDialog, setSaveTplDialog] = useState(false);
  const [tplName, setTplName] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const html = useMemo(() => mode === "visual" ? blocksToHtml(blocks, accent) : rawHtml, [mode, blocks, accent, rawHtml]);

  const { data: config } = useQuery({ queryKey: ["gmail-config"], queryFn: () => apiGet("/gmail/config") });
  const { data: statusData } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => apiGet("/gmail/campaign/status"),
    refetchInterval: 2000,
  });
  const { data: tplData } = useQuery({ queryKey: ["gmail-templates"], queryFn: () => apiGet("/gmail/templates") });
  const { data: histData } = useQuery({ queryKey: ["gmail-history"], queryFn: () => apiGet("/gmail/history"), enabled: showHistory });

  const status = statusData || { active: false };
  const configured = config?.hasPassword;

  const saveConfig = useMutation({
    mutationFn: () => apiPost("/gmail/config", { email: cfgEmail, appPassword: cfgPassword, fromName: cfgFromName }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["gmail-config"] });
      if (res.ok) { setConfigDialog(false); setCfgPassword(""); toast({ title: "Gmail connected", description: res.message }); }
      else toast({ title: "Check your details", description: res.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const sendTest = useMutation({
    mutationFn: () => apiPost("/gmail/test", { to: testEmail, subject, html }),
    onSuccess: (res: any) => toast({ title: res.ok ? "Test sent" : "Test failed", description: res.message, variant: res.ok ? undefined : "destructive" }),
  });

  const saveTpl = useMutation({
    mutationFn: () => apiPost("/gmail/templates", { name: tplName, design: mode === "visual" ? { blocks, accent } : null, html }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gmail-templates"] }); setSaveTplDialog(false); setTplName(""); toast({ title: "Template saved" }); },
  });

  const start = useMutation({
    mutationFn: () => apiPost("/gmail/campaign/start", { contacts, subject, html, minDelay, maxDelay }),
    onSuccess: (res: any) => {
      if (res.ok) { setShowLog(true); qc.invalidateQueries({ queryKey: ["gmail-status"] }); toast({ title: "Campaign started", description: `Emailing ${contacts.length} recipients` }); }
      else toast({ title: "Couldn't start", description: res.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const stop = useMutation({
    mutationFn: () => apiPost("/gmail/campaign/stop"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gmail-status"] }); toast({ title: "Stopped" }); },
  });

  const deleteHist = useMutation({
    mutationFn: (id: string) => apiFetch(`/gmail/history/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gmail-history"] }); toast({ title: "Deleted" }); },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseEmails(ev.target?.result as string);
      setContacts(parsed);
      toast({ title: `Loaded ${parsed.length} recipients`, description: file.name });
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    const parsed = parseEmails(rawInput);
    setContacts(parsed);
    toast({ title: parsed.length ? `Parsed ${parsed.length} recipients` : "No valid emails found", variant: parsed.length ? undefined : "destructive" });
  };

  const loadTemplate = (id: string) => {
    const t = (tplData?.templates || []).find((x: any) => x.id === id);
    if (!t) return;
    if (t.design?.blocks) { setMode("visual"); setBlocks(t.design.blocks); setAccent(t.design.accent || "#2563eb"); }
    else { setMode("html"); setRawHtml(t.html); }
    toast({ title: `Loaded "${t.name}"` });
  };

  const updateBlock = (id: string, patch: Partial<Block>) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b));
  const removeBlockById = (id: string) => setBlocks(bs => bs.filter(b => b.id !== id));
  const moveBlock = (id: string, dir: -1 | 1) => setBlocks(bs => {
    const i = bs.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const next = [...bs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const templates: any[] = tplData?.templates || [];
  const log: any[] = status.log || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gmail Campaign</h1>
            <p className="text-sm text-muted-foreground mt-1">Send bulk email via Gmail SMTP</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => {
            setCfgEmail(config?.email || ""); setCfgFromName(config?.fromName || ""); setCfgPassword(""); setConfigDialog(true);
          }}>
            <Settings2 className="w-4 h-4 mr-1.5" /> {configured ? "Gmail set" : "Connect Gmail"}
          </Button>
        </div>

        {!configured && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Connect your Gmail to send</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use a Gmail App Password (not your normal password). Enable 2-Step Verification, then create one at myaccount.google.com → Security → App passwords.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active campaign */}
        {status.active && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm font-semibold">Sending…</p>
                </div>
                <Badge>{status.percent ?? 0}%</Badge>
              </div>
              <Progress value={status.percent ?? 0} className="h-2" />
              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div className="rounded-md bg-green-500/10 border border-green-500/20 p-1.5"><p className="font-bold text-green-400">{status.sent ?? 0}</p><p className="text-muted-foreground">Sent</p></div>
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-1.5"><p className="font-bold text-red-400">{status.failed ?? 0}</p><p className="text-muted-foreground">Failed</p></div>
                <div className="rounded-md bg-muted/50 p-1.5"><p className="font-bold text-muted-foreground">{(status.total ?? 0) - (status.sent ?? 0) - (status.failed ?? 0)}</p><p className="text-muted-foreground">Left</p></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowLog(v => !v)}>{showLog ? "Hide log" : "Show log"}</Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={() => stop.mutate()}><Square className="w-3.5 h-3.5 mr-1.5" /> Stop</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delivery log */}
        {(showLog || (!status.active && log.length > 0)) && log.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Delivery log</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {log.slice().reverse().map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2">
                    {e.status === "sent" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      : e.status === "pending" ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    <div className="flex-1 min-w-0"><p className="text-xs text-foreground truncate">{e.email}</p>{e.name && <p className="text-xs text-muted-foreground truncate">{e.name}</p>}</div>
                    {e.error && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{e.error}</span>}
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
            <CardDescription>Upload a CSV/TXT or paste emails (one per line, or "Name &lt;email&gt;")</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1.5" /> Upload file</Button>
            <Textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder={"john@example.com\nJane Doe <jane@example.com>"} className="font-mono text-xs h-20 resize-none" />
            <Button size="sm" variant="secondary" onClick={handleParse}>Parse emails</Button>
            {contacts.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/20">
                <Users className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-green-500 font-medium">{contacts.length} recipients</p>
                <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setContacts([])}>Clear</button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email content */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4" /> Email content</CardTitle>
              <div className="flex items-center gap-2">
                <Tabs value={mode} onValueChange={v => setMode(v as any)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="visual" className="text-xs gap-1"><Wand2 className="w-3 h-3" /> Visual</TabsTrigger>
                    <TabsTrigger value="html" className="text-xs gap-1"><Code className="w-3 h-3" /> HTML</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => setShowPreview(v => !v)}>
                  <Eye className="w-3.5 h-3.5" /> {showPreview ? "Hide" : "Preview"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1" placeholder="Subject line" />
            </div>

            {templates.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Load saved template</Label>
                <Select onValueChange={loadTemplate}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select a template…" /></SelectTrigger>
                  <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {mode === "visual" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">Accent color</Label>
                  <input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="w-8 h-8 rounded border border-border bg-transparent cursor-pointer" />
                </div>
                <div className="space-y-2">
                  {blocks.map(b => (
                    <div key={b.id} className="rounded-md border border-border p-2 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs capitalize">{b.type}</Badge>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveBlock(b.id, -1)} className="text-xs text-muted-foreground hover:text-foreground px-1">↑</button>
                          <button onClick={() => moveBlock(b.id, 1)} className="text-xs text-muted-foreground hover:text-foreground px-1">↓</button>
                          <button onClick={() => removeBlockById(b.id)} className="text-muted-foreground hover:text-red-500 px-1"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                      {b.type === "divider" ? (
                        <p className="text-xs text-muted-foreground italic">Horizontal line</p>
                      ) : b.type === "text" ? (
                        <Textarea value={b.content} onChange={e => updateBlock(b.id, { content: e.target.value })} className="text-xs h-16 resize-none" />
                      ) : (
                        <Input value={b.content} onChange={e => updateBlock(b.id, { content: e.target.value })} className="text-xs h-8" placeholder={b.type === "image" ? "Image URL" : "Text"} />
                      )}
                      {b.type === "button" && (
                        <Input value={b.url || ""} onChange={e => updateBlock(b.id, { url: e.target.value })} className="text-xs h-8" placeholder="Button link URL" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["heading", "text", "button", "image", "divider"] as Block["type"][]).map(t => (
                    <Button key={t} size="sm" variant="outline" className="h-7 text-xs capitalize" onClick={() => setBlocks(bs => [...bs, newBlock(t)])}>
                      <Plus className="w-3 h-3 mr-1" /> {t}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">Raw HTML</Label>
                <Textarea value={rawHtml} onChange={e => setRawHtml(e.target.value)} className="mt-1 font-mono text-xs h-56 resize-none" />
              </div>
            )}

            <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{name}"}</code> and <code className="bg-muted px-1 rounded">{"{email}"}</code> in the subject or body for personalisation.</p>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => { setTplName(""); setSaveTplDialog(true); }}><Save className="w-3.5 h-3.5" /> Save template</Button>
              <div className="flex-1" />
              <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@example.com" className="h-8 text-xs max-w-[180px]" />
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!configured || !testEmail || sendTest.isPending} onClick={() => sendTest.mutate()}>
                {sendTest.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send test"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        {showPreview && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4" /> Live preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border border-border overflow-hidden bg-white">
                <iframe title="email-preview" srcDoc={html} className="w-full h-[420px] bg-white" sandbox="" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Send / anti-spam */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Send settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Min delay (sec)</Label><Input type="number" min={0} value={minDelay} onChange={e => setMinDelay(parseInt(e.target.value) || 0)} className="mt-1 h-8" /></div>
              <div><Label className="text-xs text-muted-foreground">Max delay (sec)</Label><Input type="number" min={0} value={maxDelay} onChange={e => setMaxDelay(parseInt(e.target.value) || 0)} className="mt-1 h-8" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Gmail limits ~500 emails/day on free accounts. Delays reduce spam flags.</p>
            <Button className="w-full" disabled={!configured || !contacts.length || status.active || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send to {contacts.length} recipient{contacts.length !== 1 ? "s" : ""}
            </Button>
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
                      <p className="text-sm text-foreground truncate">{h.subject || "(no subject)"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(h.startTime).toLocaleString()} · {h.sent}/{h.total} sent · {h.failed} failed</p>
                    </div>
                    <a href={apiUrl(`/gmail/history/${h.id}/export.csv`)} target="_blank" rel="noreferrer">
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

      {/* Config dialog */}
      <Dialog open={configDialog} onOpenChange={setConfigDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Gmail</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-muted-foreground">Gmail address</Label><Input value={cfgEmail} onChange={e => setCfgEmail(e.target.value)} placeholder="you@gmail.com" className="mt-1" /></div>
            <div><Label className="text-xs text-muted-foreground">App Password</Label><Input type="password" value={cfgPassword} onChange={e => setCfgPassword(e.target.value)} placeholder={config?.hasPassword ? "•••••••• (leave blank to keep)" : "16-char app password"} className="mt-1 font-mono" /></div>
            <div><Label className="text-xs text-muted-foreground">From name (optional)</Label><Input value={cfgFromName} onChange={e => setCfgFromName(e.target.value)} placeholder="Your Name" className="mt-1" /></div>
            <div className="p-2 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground">Create an App Password: Google Account → Security → 2-Step Verification → App passwords. Paste the 16-character code here.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(false)}>Cancel</Button>
            <Button onClick={() => saveConfig.mutate()} disabled={!cfgEmail || (!cfgPassword && !config?.hasPassword) || saveConfig.isPending}>
              {saveConfig.isPending ? "Verifying…" : "Save & verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveTplDialog} onOpenChange={setSaveTplDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save email template</DialogTitle></DialogHeader>
          <Input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTplDialog(false)}>Cancel</Button>
            <Button onClick={() => saveTpl.mutate()} disabled={!tplName.trim() || saveTpl.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
