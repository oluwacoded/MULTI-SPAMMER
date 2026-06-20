import { useState, useRef } from "react";
import { useQuery, useMutation as useRQMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCampaignStatus, useStartCampaignApi, useStopCampaignApi, getGetCampaignStatusQueryKey } from "@workspace/api-client-react";
import type { CampaignLogEntry } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Play, Square, Users, MessageSquare, Info, Wand2, Globe, ClipboardList,
  ChevronDown, ChevronUp, Shield, CheckCircle2, XCircle, Clock, AlertTriangle,
  Loader2, BookUser, Save, FileText, SkipForward, Search, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, apiGet, apiFetch } from "@/lib/api";

function parseVCF(text: string): Array<{ phone: string; name: string }> {
  const contacts: Array<{ phone: string; name: string }> = [];
  for (const card of text.split(/END:VCARD/i)) {
    const nameM = card.match(/FN:(.*)/i);
    const phoneM = card.match(/TEL[^:]*:([\d+\s\-().]+)/i);
    if (phoneM) {
      let phone = phoneM[1].replace(/\s/g, "").replace(/[^\d+]/g, "");
      if (!phone.startsWith("+")) phone = "+" + phone;
      if (phone.length >= 7) contacts.push({ phone, name: nameM ? nameM[1].trim() : phone });
    }
  }
  return contacts;
}

function parsePhoneList(text: string): Array<{ phone: string; name: string }> {
  return text.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length >= 7).map(line => {
    let phone = line.replace(/[^\d+]/g, "");
    if (!phone.startsWith("+")) phone = "+" + phone;
    return { phone, name: phone };
  }).filter(c => c.phone.length >= 8);
}

const STATUS_CONFIG = {
  sent:        { label: "Sent",       icon: CheckCircle2,  color: "text-green-500",  bg: "bg-green-500/10 border-green-500/20" },
  no_telegram: { label: "Not on TG",  icon: XCircle,       color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
  error:       { label: "Error",      icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-500/10 border-red-500/20" },
  flood_wait:  { label: "Flood Wait", icon: Clock,         color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
  pending:     { label: "Pending",    icon: Loader2,       color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  skipped:     { label: "Skipped",    icon: SkipForward,   color: "text-muted-foreground", bg: "bg-muted/30" },
} as const;

export default function TgCampaign() {
  const [contacts, setContacts] = useState<Array<{ phone: string; name: string }>>([]);
  const [message, setMessage] = useState("Hey {name}! 👋");
  const [rawInput, setRawInput] = useState("");
  const [groupLink, setGroupLink] = useState("");
  const [groupLimit, setGroupLimit] = useState("5000");
  const [generateDialog, setGenerateDialog] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeCount, setScrapeCount] = useState("50");
  const [showAntiBan, setShowAntiBan] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logFilter, setLogFilter] = useState("all");
  const [saveListDialog, setSaveListDialog] = useState(false);
  const [saveListName, setSaveListName] = useState("");
  const [saveTemplateDialog, setSaveTemplateDialog] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [loadListDialog, setLoadListDialog] = useState(false);

  const [massBroadcast, setMassBroadcast] = useState(false);

  const [antiBan, setAntiBan] = useState({
    minDelay: 3, maxDelay: 8, batchSize: 20, batchPauseMin: 5,
    typingDelay: false, autoVariation: true, dailyLimit: 0,
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status } = useGetCampaignStatus({ query: { refetchInterval: 2000 } });
  const startCampaign = useStartCampaignApi();
  const stopCampaign = useStopCampaignApi();

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiGet("/templates"),
  });

  const { data: listsData } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => apiGet("/contact-lists"),
  });

  const saveList = useRQMutation({
    mutationFn: ({ name, contacts }: { name: string; contacts: any[] }) =>
      apiPost("/contact-lists", { name, contacts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
      setSaveListDialog(false);
      setSaveListName("");
      toast({ title: "List saved!" });
    },
  });

  const saveTemplate = useRQMutation({
    mutationFn: ({ name, message }: { name: string; message: string }) =>
      apiPost("/templates", { name, message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setSaveTemplateDialog(false);
      setSaveTemplateName("");
      toast({ title: "Template saved!" });
    },
  });

  const loadListContacts = async (id: string, name: string) => {
    const data = await apiGet(`/contact-lists/${id}`);
    if (data.contacts?.length) {
      setContacts(data.contacts);
      setLoadListDialog(false);
      toast({ title: `Loaded "${name}"`, description: `${data.contacts.length} contacts` });
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = file.name.endsWith(".vcf") ? parseVCF(text) : parsePhoneList(text);
      setContacts(parsed);
      toast({ title: `Loaded ${parsed.length} contacts`, description: file.name });
    };
    reader.readAsText(file);
  };

  const handleRawParse = () => {
    const parsed = parsePhoneList(rawInput);
    setContacts(parsed);
    if (parsed.length > 0) toast({ title: `Parsed ${parsed.length} contacts` });
    else toast({ title: "No valid numbers found", variant: "destructive" });
  };

  const scrapeGroup = useRQMutation({
    mutationFn: () => apiPost("/scrape/group", { link: groupLink.trim(), limit: parseInt(groupLimit) || 5000 }),
    onSuccess: (res: any) => {
      if (res.ok) {
        const mapped = (res.members || [])
          .map((m: any) => ({
            phone: m.phone || (m.username ? `@${m.username}` : ""),
            name: m.name,
            username: m.username || undefined,
            id: m.id || undefined,
          }))
          .filter((c: any) => c.phone);
        setContacts(mapped);
        toast({ title: `Loaded ${mapped.length} contacts`, description: `from ${res.count} group members` });
      } else {
        toast({ title: "Scrape failed", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const handleScrape = async () => {
    setScraping(true);
    try {
      const resp = await apiFetch(`/scrape/us-phones?count=${scrapeCount}`);
      const data = await resp.json();
      const parsed = (data.phones as string[]).map(p => ({ phone: p, name: p }));
      setContacts(parsed);
      setGenerateDialog(false);
      toast({
        title: `${parsed.length} numbers loaded`,
        description: data.source === "coolgenerator.com" ? "Pulled from coolgenerator.com" : "Generated locally"
      });
    } catch {
      toast({ title: "Failed to fetch numbers", variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const handleStart = () => {
    if (!contacts.length) { toast({ title: "No contacts", variant: "destructive" }); return; }
    if (!message.trim()) { toast({ title: "No message", variant: "destructive" }); return; }
    const payload = massBroadcast
      ? { contacts, message, minDelay: 0, maxDelay: 0, batchSize: 0, batchPauseMin: 0, typingDelay: false, autoVariation: antiBan.autoVariation, dailyLimit: 0, noCooldown: true }
      : { contacts, message, ...antiBan };
    startCampaign.mutate({ data: payload }, {
      onSuccess: (res) => {
        if (res.ok) {
          setShowLog(true);
          qc.invalidateQueries({ queryKey: getGetCampaignStatusQueryKey() });
          toast({ title: "Campaign started!", description: `Sending to ${contacts.length} contacts` });
        } else {
          toast({ title: "Error", description: res.message || "Failed", variant: "destructive" });
        }
      },
      onError: (err: any) => toast({ title: "Request failed", description: err?.message, variant: "destructive" }),
    });
  };

  const handleStop = () => {
    stopCampaign.mutate({}, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCampaignStatusQueryKey() });
        toast({ title: "Campaign stopped" });
      }
    });
  };

  const log: CampaignLogEntry[] = status?.log || [];
  const filteredLog = logFilter === "all" ? log : log.filter(e => e.status === logFilter);
  const sentCount = log.filter(e => e.status === "sent").length;
  const noTgCount = log.filter(e => e.status === "no_telegram").length;
  const errorCount = log.filter(e => e.status === "error").length;
  const skippedCount = log.filter(e => e.status === "skipped").length;
  const pendingCount = log.filter(e => e.status === "pending").length;

  const templates: any[] = templatesData?.templates || [];
  const savedLists: any[] = listsData?.lists || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telegram Campaign</h1>
          <p className="text-sm text-muted-foreground mt-1">Bulk DM via VCF, phone list, or generated numbers</p>
        </div>

        {/* Active campaign status */}
        {status?.active && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm font-semibold">Campaign Running</p>
                  {(status.floodWait ?? 0) > 0 && (
                    <Badge variant="outline" className="text-orange-400 border-orange-400/40 text-xs">
                      Flood wait {status.floodWait}s
                    </Badge>
                  )}
                </div>
                <Badge>{status.percent ?? 0}%</Badge>
              </div>
              <Progress value={status.percent ?? 0} className="h-2" />
              <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                <div className="rounded-md bg-green-500/10 border border-green-500/20 p-1.5">
                  <p className="font-bold text-green-400">{status.sent ?? 0}</p>
                  <p className="text-muted-foreground">Sent</p>
                </div>
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-1.5">
                  <p className="font-bold text-yellow-400">{status.noTelegram ?? 0}</p>
                  <p className="text-muted-foreground">No TG</p>
                </div>
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-1.5">
                  <p className="font-bold text-red-400">{status.failed ?? 0}</p>
                  <p className="text-muted-foreground">Error</p>
                </div>
                <div className="rounded-md bg-muted/50 p-1.5">
                  <p className="font-bold text-muted-foreground">{status.skipped ?? 0}</p>
                  <p className="text-muted-foreground">Skipped</p>
                </div>
                <div className="rounded-md bg-muted/50 p-1.5">
                  <p className="font-bold text-muted-foreground">
                    {(status.total ?? 0) - (status.sent ?? 0) - (status.noTelegram ?? 0) - (status.failed ?? 0) - (status.skipped ?? 0)}
                  </p>
                  <p className="text-muted-foreground">Left</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowLog(v => !v)}>
                  {showLog ? "Hide Log" : "Show Log"}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleStop} disabled={stopCampaign.isPending} className="flex-1">
                  <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log */}
        {(showLog || (!status?.active && log.length > 0)) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> Delivery Log
                </CardTitle>
                <button onClick={() => setShowLog(v => !v)} className="text-muted-foreground hover:text-foreground">
                  {showLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {log.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {[
                    { key: "all",        label: `All (${log.length})` },
                    { key: "sent",       label: `✓ ${sentCount}` },
                    { key: "no_telegram",label: `✗ ${noTgCount}` },
                    { key: "error",      label: `⚠ ${errorCount}` },
                    { key: "skipped",    label: `⏭ ${skippedCount}` },
                    { key: "pending",    label: `⏳ ${pendingCount}` },
                  ].map(({ key, label }) => (
                    <button key={key} onClick={() => setLogFilter(key)}
                      className={cn("px-2 py-0.5 rounded-full text-xs border transition-colors",
                        logFilter === key ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >{label}</button>
                  ))}
                </div>
              )}
            </CardHeader>
            {showLog && (
              <CardContent className="p-0">
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {filteredLog.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No entries yet</p>}
                  {filteredLog.slice().reverse().map((entry, i) => {
                    const cfg = STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.error;
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                        <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color, entry.status === "pending" && "animate-spin")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-foreground truncate">{entry.phone}</p>
                          {entry.name && entry.name !== entry.phone && (
                            <p className="text-xs text-muted-foreground truncate">{entry.name}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</span>
                          {entry.error && <p className="text-xs text-muted-foreground truncate max-w-[120px]">{entry.error}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Contacts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Contacts</CardTitle>
            <CardDescription>Import VCF, CSV, paste numbers, or generate US phone numbers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept=".vcf,.csv,.txt" className="hidden" onChange={handleFile} />
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="w-full col-span-1" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1.5" /> Upload
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setGenerateDialog(true)}>
                <Wand2 className="w-4 h-4 mr-1.5" /> Generate
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLoadListDialog(true)} disabled={savedLists.length === 0}>
                <BookUser className="w-4 h-4 mr-1.5" /> My Lists
                {savedLists.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{savedLists.length}</Badge>}
              </Button>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Or paste phone numbers (one per line)</p>
              <Textarea
                placeholder="+2349012345678&#10;+2348012345678&#10;+447911123456"
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                className="font-mono text-xs h-20 resize-none"
              />
              <Button size="sm" variant="secondary" className="mt-2" onClick={handleRawParse}>Parse Numbers</Button>
            </div>
            {contacts.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/20">
                <Users className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-green-500 font-medium">{contacts.length} contacts loaded</p>
                <Button
                  size="sm" variant="ghost" className="ml-auto h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => { setSaveListName(""); setSaveListDialog(true); }}
                >
                  <Save className="w-3 h-3" /> Save list
                </Button>
                <button className="text-xs text-muted-foreground hover:text-foreground ml-1" onClick={() => setContacts([])}>Clear</button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scrape Telegram group → contacts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4" /> Pull from Telegram group</CardTitle>
            <CardDescription>Load members of a public group/channel straight into your contacts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Label className="text-xs text-muted-foreground">Group link or @username</Label>
                <Input
                  value={groupLink}
                  onChange={e => setGroupLink(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && groupLink.trim()) scrapeGroup.mutate(); }}
                  placeholder="https://t.me/groupname or @groupname"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div className="w-20 shrink-0">
                <Label className="text-xs text-muted-foreground">Max</Label>
                <Input type="number" min={1} max={10000} value={groupLimit} onChange={e => setGroupLimit(e.target.value)} className="mt-1 h-9" />
              </div>
              <Button onClick={() => scrapeGroup.mutate()} disabled={!groupLink.trim() || scrapeGroup.isPending} className="shrink-0">
                {scrapeGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Uses your logged-in Telegram session. Public members load directly as contacts (phone where visible, otherwise @username).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Message */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Message</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => { setSaveTemplateName(""); setSaveTemplateDialog(true); }}>
                <Save className="w-3 h-3" /> Save template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Load template</Label>
                <Select onValueChange={val => {
                  const t = templates.find(t => t.id === val);
                  if (t) setMessage(t.message);
                }}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Select a saved template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="h-28 resize-none"
              placeholder="Your message here..."
            />
            <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{"{name}"}</code> and <code className="bg-muted px-1 rounded">{"{phone}"}</code> for personalisation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mass Broadcast toggle */}
        <Card className={massBroadcast ? "border-red-500/40 bg-red-500/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className={cn("w-4 h-4", massBroadcast ? "text-red-500" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium">⚡ Mass Broadcast</p>
                  <p className="text-xs text-muted-foreground">Send with no cooldown or delay — fastest speed</p>
                </div>
              </div>
              <Switch checked={massBroadcast} onCheckedChange={setMassBroadcast} />
            </div>
            {massBroadcast && (
              <div className="mt-3 flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">
                  <strong>High risk:</strong> No delays applied. Telegram may flood-wait or ban your account. Use on a secondary account only.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anti-Ban */}
        <Card>
          <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setShowAntiBan(v => !v)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" /> Anti-Ban Settings
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-500">Active</span>
                {showAntiBan ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            {!showAntiBan && (
              <p className="text-xs text-muted-foreground mt-1">
                Delay: {antiBan.minDelay}–{antiBan.maxDelay}s · Batch: {antiBan.batchSize}/{antiBan.batchPauseMin}min · Variation: {antiBan.autoVariation ? "on" : "off"}
              </p>
            )}
          </CardHeader>
          {showAntiBan && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Min delay (sec)", key: "minDelay", min: 1, max: 60 },
                  { label: "Max delay (sec)", key: "maxDelay", min: 1, max: 120 },
                  { label: "Batch size (msgs)", key: "batchSize", min: 1, max: 200 },
                  { label: "Batch pause (min)", key: "batchPauseMin", min: 1, max: 60 },
                  { label: "Daily limit (0 = off)", key: "dailyLimit", min: 0, max: 10000 },
                ].map(({ label, key, min, max }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input type="number" min={min} max={max}
                      value={(antiBan as any)[key]}
                      onChange={e => setAntiBan(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Auto-variation</Label>
                    <p className="text-xs text-muted-foreground">Invisible unicode chars to avoid duplicate detection</p>
                  </div>
                  <Switch checked={antiBan.autoVariation} onCheckedChange={v => setAntiBan(p => ({ ...p, autoVariation: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Typing simulation</Label>
                    <p className="text-xs text-muted-foreground">Show "typing…" before each message is sent</p>
                  </div>
                  <Switch checked={antiBan.typingDelay} onCheckedChange={v => setAntiBan(p => ({ ...p, typingDelay: v }))} />
                </div>
              </div>
              <div className="p-2 rounded-md bg-muted/40">
                <p className="text-xs font-medium text-foreground">Safe preset</p>
                <p className="text-xs text-muted-foreground mb-1.5">Delay 5–12s · Batches of 15 / 10 min pause · Daily limit 200</p>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setAntiBan({ minDelay: 5, maxDelay: 12, batchSize: 15, batchPauseMin: 10, typingDelay: true, autoVariation: true, dailyLimit: 200 })}>
                  Apply safe preset
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        <Button className="w-full" size="lg" onClick={handleStart}
          disabled={startCampaign.isPending || status?.active || !contacts.length}>
          <Play className="w-4 h-4 mr-2" />
          {startCampaign.isPending ? "Starting..." : `Send to ${contacts.length || "?"} Contacts`}
        </Button>

        {/* Generate dialog */}
        <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Get Phone Numbers</DialogTitle>
              <DialogDescription>Where do you want to get the phone numbers from?</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">How many?</Label>
                <Input type="number" min={10} max={500} value={scrapeCount}
                  onChange={e => setScrapeCount(e.target.value)} className="h-8 text-sm" />
              </div>
              <button
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                onClick={handleScrape} disabled={scraping}
              >
                <Globe className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Pull from coolgenerator.com</p>
                  <p className="text-xs text-muted-foreground">Fetch US numbers from the web (fallback: generate locally)</p>
                </div>
                {scraping && <Loader2 className="w-4 h-4 animate-spin ml-auto shrink-0 mt-0.5 text-primary" />}
              </button>
              <button
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                onClick={() => setGenerateDialog(false)}
              >
                <ClipboardList className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Paste my own numbers</p>
                  <p className="text-xs text-muted-foreground">Use the text area or upload a VCF/CSV file</p>
                </div>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Load from saved list dialog */}
        <Dialog open={loadListDialog} onOpenChange={setLoadListDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><BookUser className="w-4 h-4" /> Load Saved List</DialogTitle>
              <DialogDescription>Pick a contact list to load for this campaign.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {savedLists.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No saved lists yet.</p>}
              {savedLists.map((list: any) => (
                <button
                  key={list.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                  onClick={() => loadListContacts(list.id, list.name)}
                >
                  <BookUser className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{list.name}</p>
                    <p className="text-xs text-muted-foreground">{list.count} contacts</p>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Save list dialog */}
        <Dialog open={saveListDialog} onOpenChange={setSaveListDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Save Contact List</DialogTitle>
              <DialogDescription>Save these {contacts.length} contacts for reuse.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">List name</Label>
                <Input value={saveListName} onChange={e => setSaveListName(e.target.value)}
                  placeholder="e.g. US Leads June" className="mt-1 text-sm"
                  onKeyDown={e => e.key === "Enter" && saveListName && saveList.mutate({ name: saveListName, contacts })}
                />
              </div>
              <Button className="w-full" onClick={() => saveList.mutate({ name: saveListName, contacts })}
                disabled={!saveListName || saveList.isPending}>
                <Save className="w-3.5 h-3.5 mr-2" /> Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Save template dialog */}
        <Dialog open={saveTemplateDialog} onOpenChange={setSaveTemplateDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Save Message Template</DialogTitle>
              <DialogDescription>Save this message for quick reuse in future campaigns.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)}
                  placeholder="e.g. Product Launch" className="mt-1 text-sm"
                  onKeyDown={e => e.key === "Enter" && saveTemplateName && saveTemplate.mutate({ name: saveTemplateName, message })}
                />
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground truncate font-mono">{message.slice(0, 80)}{message.length > 80 ? "…" : ""}</p>
              </div>
              <Button className="w-full" onClick={() => saveTemplate.mutate({ name: saveTemplateName, message })}
                disabled={!saveTemplateName || saveTemplate.isPending}>
                <FileText className="w-3.5 h-3.5 mr-2" /> Save Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
