import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { useRunAccount } from "@/hooks/use-tg-accounts";
import { AccountSelector } from "@/components/AccountSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiPost, apiGet } from "@/lib/api";
import { Users, Download, Search, Loader2, Info, Save, AlertTriangle, Phone, AtSign, UserPlus, Zap, CheckCircle2, XCircle, ShieldX, ShieldCheck, BookUser, Plus, X, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member { username: string | null; phone: string | null; name: string; id: string; }

// Targets can be entered comma- or newline-separated; split, trim and dedupe.
function parseTargets(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)));
}

export default function TgScraper() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { accounts, accountId, setAccountId, selected } = useRunAccount(5000);
  const connected = !!selected?.connected;

  const [link, setLink] = useState("");
  const [limit, setLimit] = useState("5000");
  // Add pacing: "safe" adds slowly with a per-run cap (much less likely to trip
  // Telegram's PEER_FLOOD limit); "turbo" adds as fast as Telegram allows.
  const [addMode, setAddMode] = useState<"safe" | "turbo">("turbo");
  const safeMode = addMode === "safe";
  const [members, setMembers] = useState<Member[]>([]);
  const [saveDialog, setSaveDialog] = useState(false);
  const [listName, setListName] = useState("");

  // Multi-source queue state
  const [sourceInput, setSourceInput] = useState("");
  const [sourceGroups, setSourceGroups] = useState<string[]>([]);
  const [scrapeAddTarget, setScrapeAddTarget] = useState("");

  // Add-to-group state (for scraped-members-in-memory flow)
  const [targetGroup, setTargetGroup] = useState("");
  const [addListId, setAddListId] = useState("");
  const [addListTarget, setAddListTarget] = useState("");

  const { data: listsData } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => apiGet("/contact-lists"),
  });

  const { data: addStatus, refetch: refetchAdd } = useQuery({
    queryKey: ["add-status", accountId],
    queryFn: () => apiGet(`/scrape/add-status${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`),
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.active ? 800 : false;
    },
  });

  const scrape = useMutation({
    mutationFn: () => apiPost("/scrape/group", { link, limit: parseInt(limit) || 5000, accountId }),
    onSuccess: (res: any) => {
      if (res.ok) {
        setMembers(res.members || []);
        toast({ title: `Found ${res.count} members`, description: res.count === 0 ? "No public members returned" : undefined });
      } else {
        toast({ title: "Scrape failed", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const saveList = useMutation({
    mutationFn: (contacts: any[]) => apiPost("/contact-lists", { name: listName, contacts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
      setSaveDialog(false);
      setListName("");
      toast({ title: "Saved to contact lists" });
    },
  });

  // Multi-source scrape & add
  const startAddDirect = useMutation({
    mutationFn: (data: { sourceGroups: string[]; targetGroups: string[]; limit: number }) =>
      apiPost("/scrape/add-members", { ...data, safeMode, accountId }),
    onSuccess: (res: any) => {
      if (res.ok) {
        refetchAdd();
        toast({ title: "Scrape & Add started", description: res.message });
      } else {
        toast({ title: "Failed to start", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const startAdd = useMutation({
    mutationFn: (data: { targetGroups: string[]; members: Member[] }) =>
      apiPost("/scrape/add-members", { ...data, safeMode, accountId }),
    onSuccess: (res: any) => {
      if (res.ok) {
        refetchAdd();
        toast({ title: "Add job started", description: res.message });
      } else {
        toast({ title: "Failed to start", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const stopAdd = useMutation({
    mutationFn: () => apiPost("/scrape/add-stop", { accountId }),
    onSuccess: () => {
      refetchAdd();
      toast({ title: "Add job stopped" });
    },
  });

  const startAddFromList = useMutation({
    mutationFn: (data: { listId: string; targetGroups: string[] }) =>
      apiPost("/scrape/add-from-list", { ...data, safeMode, accountId }),
    onSuccess: (res: any) => {
      if (res.ok) {
        refetchAdd();
        toast({ title: "Add job started", description: res.message });
      } else {
        toast({ title: "Failed to start", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const withPhone = members.filter(m => m.phone);
  const withUsername = members.filter(m => m.username);

  const handleSave = () => {
    const contacts = members
      .map(m => ({
        phone: m.phone || (m.username ? `@${m.username}` : ""),
        name: m.name,
        username: m.username || undefined,
        id: m.id || undefined,
      }))
      .filter(c => c.phone);
    if (!contacts.length) {
      toast({ title: "Nothing to save", description: "No phone numbers or usernames available", variant: "destructive" });
      return;
    }
    saveList.mutate(contacts);
  };

  const downloadCsv = () => {
    const rows = ["name,username,phone,id"];
    for (const m of members) {
      rows.push(`"${m.name}","${m.username || ""}","${m.phone || ""}","${m.id}"`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "group-members.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const addSourceGroup = () => {
    const val = sourceInput.trim();
    if (!val) return;
    if (sourceGroups.includes(val)) {
      toast({ title: "Already in the list", variant: "destructive" });
      return;
    }
    setSourceGroups(prev => [...prev, val]);
    setSourceInput("");
  };

  const removeSourceGroup = (idx: number) => {
    setSourceGroups(prev => prev.filter((_, i) => i !== idx));
  };

  const savedLists: any[] = listsData?.lists || [];
  const addJobActive = (addStatus as any)?.active;
  const addJobLog = (addStatus as any)?.log;

  // Keep the finished job's result (and its log explaining why it ended) on screen
  // until the user dismisses it or a new job starts — otherwise the card vanishes
  // the instant the job goes inactive and the form reappears with no explanation.
  // Key the dismissal on job identity (account + startTime) so dismissing one
  // account's result never hides another's, and a brand-new job (even one that
  // finishes between polls) always shows because its key differs.
  const addJobStartTime = (addStatus as any)?.startTime ?? 0;
  const jobKey = addJobStartTime ? `${accountId ?? ""}:${addJobStartTime}` : null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const addJobFinished = !addJobActive && jobKey != null && dismissedKey !== jobKey && Array.isArray(addJobLog) && addJobLog.length > 0;
  const addJobVisible = addJobActive || addJobFinished;
  const dismissResult = () => setDismissedKey(jobKey);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Group Scraper</h1>
          <p className="text-sm text-muted-foreground mt-1">Pull members from a public Telegram group or channel</p>
        </div>

        {accounts.some(a => a.connected) ? (
          <Card>
            <CardContent className="p-4">
              <AccountSelector accounts={accounts} accountId={accountId} onChange={setAccountId} />
              <p className="text-[11px] text-muted-foreground mt-2">
                Scraping and adding run as this account, using its own Telegram session. Each connected account can run its own job at the same time.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">No Telegram account connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">Log in at least one account first — scraping uses that account's Telegram session.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Add speed (applies to every add below)</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddMode("safe")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                  safeMode ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Safe (recommended)
              </button>
              <button
                type="button"
                onClick={() => setAddMode("turbo")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                  !safeMode ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Zap className="w-3.5 h-3.5" /> Turbo (risky)
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {safeMode
                ? "Adds slowly (~30–75s between members) and stops after 40 per run, then rest the account. This is the safest way to avoid Telegram's PEER_FLOOD ban. Run again later or use another account for more."
                : "Adds as fast as Telegram allows. Much higher risk of PEER_FLOOD — Telegram may limit or ban the account. Note: PEER_FLOOD can't be bypassed in code; it's enforced by Telegram."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4" /> Target group</CardTitle>
            <CardDescription>Paste a public group link or @username</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Group link or username</Label>
              <Input
                value={link}
                onChange={e => setLink(e.target.value)}
                onKeyDown={e => e.key === "Enter" && connected && link && scrape.mutate()}
                placeholder="https://t.me/groupname  or  @groupname"
                className="mt-1 font-mono text-sm"
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="w-32">
                <Label className="text-xs text-muted-foreground">Max members</Label>
                <Input type="number" min={1} max={10000} value={limit} onChange={e => setLimit(e.target.value)} className="mt-1 h-9" />
              </div>
              <Button
                onClick={() => scrape.mutate()}
                disabled={!connected || !link.trim() || scrape.isPending}
                className="flex-1"
              >
                {scrape.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                {scrape.isPending ? "Scraping…" : "Scrape Members"}
              </Button>
            </div>
            <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Only public groups/channels where members are visible can be scraped. Private invite links (t.me/+…) won't work.
                Most users hide their phone number, so you'll usually get @usernames.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Multi-Source: Scrape & Auto-Add ──────────────────────────────── */}
        <Card className={addJobActive ? "border-primary/30" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Scrape &amp; Auto-Add (Multi-Source)
            </CardTitle>
            <CardDescription>Queue multiple source groups — the bot scrapes all of them, deduplicates, and adds members to your target in one pass</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {addJobVisible ? (
              <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} onDismiss={dismissResult} />
            ) : (
              <>
                {/* Source groups list */}
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><List className="w-3 h-3" /> Source groups (to steal from)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={sourceInput}
                      onChange={e => setSourceInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSourceGroup()}
                      placeholder="@sourcegroup or t.me/…"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addSourceGroup}
                      disabled={!sourceInput.trim()}
                      className="shrink-0 px-3"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {sourceGroups.length > 0 && (
                    <div className="mt-2 rounded-md border divide-y divide-border">
                      {sourceGroups.map((sg, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2">
                          <span className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{i + 1}</span>
                          <span className="flex-1 text-xs font-mono text-foreground truncate">{sg}</span>
                          <button
                            type="button"
                            onClick={() => removeSourceGroup(i)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            aria-label="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {sourceGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1.5 pl-0.5">Add at least one source group above, then set your target below.</p>
                  )}
                </div>

                {/* Target group(s) */}
                <div>
                  <Label className="text-xs text-muted-foreground">Your target group(s)/channel(s)</Label>
                  <Textarea
                    value={scrapeAddTarget}
                    onChange={e => setScrapeAddTarget(e.target.value)}
                    placeholder="@mygroup or t.me/… — one per line or comma-separated for multiple"
                    rows={2}
                    className="mt-1 font-mono text-xs"
                  />
                  {parseTargets(scrapeAddTarget).length > 1 && (
                    <p className="text-[11px] text-muted-foreground mt-1">Will add to {parseTargets(scrapeAddTarget).length} targets, one after another.</p>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <div className="w-28 shrink-0">
                    <Label className="text-xs text-muted-foreground">Max / source</Label>
                    <Input type="number" min={1} max={10000} value={limit} onChange={e => setLimit(e.target.value)} className="mt-1 h-9" />
                  </div>
                  <Button
                    className="flex-1"
                    onClick={() => startAddDirect.mutate({ sourceGroups, targetGroups: parseTargets(scrapeAddTarget), limit: parseInt(limit) || 5000 })}
                    disabled={!connected || sourceGroups.length === 0 || parseTargets(scrapeAddTarget).length === 0 || startAddDirect.isPending}
                  >
                    {startAddDirect.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    {startAddDirect.isPending ? "Starting…" : `Scrape & Add${sourceGroups.length > 1 ? ` (${sourceGroups.length} sources)` : ""}`}
                  </Button>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                  <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Each source is scraped sequentially. Members appearing in multiple groups are only added once (deduplication by username/ID). Pacing follows the Add speed setting above.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {members.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> {members.length} members</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={downloadCsv}><Download className="w-3.5 h-3.5 mr-1.5" /> CSV</Button>
                  <Button size="sm" onClick={() => { setListName(""); setSaveDialog(true); }}><Save className="w-3.5 h-3.5 mr-1.5" /> Save list</Button>
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs gap-1"><Phone className="w-3 h-3" /> {withPhone.length} with phone</Badge>
                <Badge variant="outline" className="text-xs gap-1"><AtSign className="w-3 h-3" /> {withUsername.length} with username</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {members.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{m.name}</p>
                      {m.username && <p className="text-xs text-muted-foreground truncate">@{m.username}</p>}
                    </div>
                    {m.phone && <span className="text-xs font-mono text-muted-foreground shrink-0">{m.phone}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add to My Group — from scraped members */}
        {members.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> Add Scraped Members to My Group
              </CardTitle>
              <CardDescription>Auto-add all {members.length} scraped members to one of your groups or channels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {addJobVisible ? (
                <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} onDismiss={dismissResult} />
              ) : (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Your group(s)/channel(s) @username or link</Label>
                    <Textarea
                      value={targetGroup}
                      onChange={e => setTargetGroup(e.target.value)}
                      placeholder="@mygroup or https://t.me/mygroup — one per line or comma-separated for multiple"
                      rows={2}
                      className="mt-1 font-mono text-sm"
                    />
                    {parseTargets(targetGroup).length > 1 && (
                      <p className="text-[11px] text-muted-foreground mt-1">Will add to {parseTargets(targetGroup).length} targets, one after another.</p>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => startAdd.mutate({ targetGroups: parseTargets(targetGroup), members })}
                    disabled={parseTargets(targetGroup).length === 0 || startAdd.isPending || !connected}
                  >
                    {startAdd.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    {startAdd.isPending ? "Starting…" : `Add ${members.length} Members${parseTargets(targetGroup).length > 1 ? ` × ${parseTargets(targetGroup).length}` : ""}`}
                  </Button>
                  <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Pacing follows the Add speed setting above. Users with privacy settings are skipped automatically, and the job pauses on flood waits.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Live add-job progress even after members are cleared */}
        {!members.length && addJobVisible && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> {addJobActive ? "Add Job Running" : "Last Job Result"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} onDismiss={dismissResult} />
            </CardContent>
          </Card>
        )}

        {/* Standalone: Add from Saved Contact List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookUser className="w-4 h-4" /> Add Members from Saved List
            </CardTitle>
            <CardDescription>Pick a saved contact list and add those members directly to any of your groups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedLists.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved contact lists yet. Scrape a group and save it, or build one in the Telegram Campaign page.</p>
            ) : (
              <>
                {addJobVisible ? (
                  <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} onDismiss={dismissResult} />
                ) : (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact list</Label>
                      <Select value={addListId} onValueChange={setAddListId}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                          <SelectValue placeholder="Select a saved list…" />
                        </SelectTrigger>
                        <SelectContent>
                          {savedLists.map((l: any) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name} ({l.count} contacts)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Target group(s)/channel(s)</Label>
                      <Textarea
                        value={addListTarget}
                        onChange={e => setAddListTarget(e.target.value)}
                        placeholder="@mygroup or https://t.me/mygroup — one per line or comma-separated for multiple"
                        rows={2}
                        className="mt-1 font-mono text-sm"
                      />
                      {parseTargets(addListTarget).length > 1 && (
                        <p className="text-[11px] text-muted-foreground mt-1">Will add to {parseTargets(addListTarget).length} targets, one after another.</p>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => startAddFromList.mutate({ listId: addListId, targetGroups: parseTargets(addListTarget) })}
                      disabled={!addListId || parseTargets(addListTarget).length === 0 || startAddFromList.isPending || !connected}
                    >
                      {startAddFromList.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                      {startAddFromList.isPending ? "Starting…" : "Start Adding"}
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={saveDialog} onOpenChange={setSaveDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Save as contact list</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">List name</Label>
              <Input value={listName} onChange={e => setListName(e.target.value)} placeholder="e.g. Crypto Group Members" autoFocus />
              <p className="text-xs text-muted-foreground">
                {members.filter(m => m.phone || m.username).length} contacts will be saved (members without phone or username are skipped).
                {savedLists.length > 0 && ` You have ${savedLists.length} saved list${savedLists.length > 1 ? "s" : ""}.`}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!listName.trim() || saveList.isPending}>
                {saveList.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function AddJobProgress({ status, onStop, stopping, onDismiss }: { status: any; onStop: () => void; stopping: boolean; onDismiss?: () => void }) {
  const pct = status?.percent ?? 0;
  const active = status?.active ?? false;
  const scrapePhase = status?.scrapePhase ?? false;
  const currentSource = status?.currentSource ?? null;
  const sourcesTotal = status?.sourcesTotal ?? 0;
  const sourcesDone = status?.sourcesDone ?? 0;
  const targetsTotal = status?.targetsTotal ?? 0;
  const targetIndex = status?.targetIndex ?? 0;
  const currentTarget = status?.currentTarget ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("w-2 h-2 rounded-full", active ? "bg-green-500 animate-pulse" : "bg-muted-foreground")} />
          <p className="text-sm font-semibold">
            {active ? (scrapePhase ? "Scraping sources…" : "Adding members…") : "Job finished"}
          </p>
          {scrapePhase && sourcesTotal > 0 && (
            <Badge variant="outline" className="text-blue-400 border-blue-400/40 text-xs">
              {sourcesDone}/{sourcesTotal} scraped
            </Badge>
          )}
          {!scrapePhase && targetsTotal > 1 && (
            <Badge variant="outline" className="text-purple-400 border-purple-400/40 text-xs">
              Target {Math.min(targetIndex + 1, targetsTotal)}/{targetsTotal}
            </Badge>
          )}
          {(status?.floodWait ?? 0) > 0 && (
            <Badge variant="outline" className="text-orange-400 border-orange-400/40 text-xs">
              Flood wait {status.floodWait}s
            </Badge>
          )}
        </div>
        {!scrapePhase && <Badge>{pct}%</Badge>}
      </div>

      {/* Scrape phase: show current source being scraped */}
      {scrapePhase && currentSource && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/20">
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
          <p className="text-xs text-blue-300 font-mono truncate">{currentSource}</p>
        </div>
      )}

      {/* Add phase: show which target is currently being filled (multi-target) */}
      {!scrapePhase && active && targetsTotal > 1 && currentTarget && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-purple-500/5 border border-purple-500/20">
          <UserPlus className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <p className="text-xs text-purple-300 font-mono truncate">Adding to: {currentTarget}</p>
        </div>
      )}

      {/* Add phase: progress bar + stats */}
      {!scrapePhase && (
        <>
          <Progress value={pct} className="h-2" />
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
            <div className="rounded-md bg-green-500/10 border border-green-500/20 p-1.5">
              <p className="font-bold text-green-400">{status?.added ?? 0}</p>
              <p className="text-muted-foreground">Added</p>
            </div>
            <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-1.5">
              <p className="font-bold text-yellow-400">{status?.privacy ?? 0}</p>
              <p className="text-muted-foreground">Privacy</p>
            </div>
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-1.5">
              <p className="font-bold text-red-400">{status?.failed ?? 0}</p>
              <p className="text-muted-foreground">Failed</p>
            </div>
            <div className="rounded-md bg-muted/50 p-1.5">
              <p className="font-bold text-muted-foreground">{(status?.total ?? 0) - (status?.index ?? 0)}</p>
              <p className="text-muted-foreground">Left</p>
            </div>
          </div>
        </>
      )}

      {/* Recent log */}
      {status?.log?.length > 0 && (
        <div className="max-h-36 overflow-y-auto divide-y divide-border rounded-md border">
          {[...(status.log as any[])].reverse().slice(0, 20).map((entry: any, i: number) => {
            const isInfo = entry.status === "info" || entry.status === "scraped";
            const isScraping = entry.status === "scraping";
            const isAdded = entry.status === "added" || entry.status === "already";
            const isPrivacy = entry.status === "privacy";
            const isFail = entry.status === "failed" || entry.status === "skipped";
            const isDone = entry.status === "done" || entry.status === "stopped";
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                {isScraping && <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />}
                {isInfo && <span className="w-3 h-3 rounded-full bg-blue-400/80 shrink-0" />}
                {isAdded && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                {isPrivacy && <ShieldX className="w-3 h-3 text-yellow-400 shrink-0" />}
                {isFail && <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                {isDone && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />}
                <span className={cn("text-xs truncate", isDone && "text-primary font-medium", (isScraping || isInfo) && "text-blue-300")}>
                  {entry.msg || (entry.username ? `@${entry.username}` : entry.name) || "—"}
                </span>
                {entry.error && <span className="text-xs text-muted-foreground ml-auto shrink-0 truncate max-w-[120px]">{entry.error}</span>}
              </div>
            );
          })}
        </div>
      )}

      {active ? (
        <Button variant="destructive" size="sm" className="w-full" onClick={onStop} disabled={stopping}>
          {stopping ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
          Stop Job
        </Button>
      ) : (
        <Button variant="secondary" size="sm" className="w-full" onClick={onDismiss}>
          Done
        </Button>
      )}
    </div>
  );
}
