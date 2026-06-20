import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetBotStatus } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiPost, apiGet } from "@/lib/api";
import { Users, Download, Search, Loader2, Info, Save, AlertTriangle, Phone, AtSign, UserPlus, Zap, Square, CheckCircle2, XCircle, ShieldX, BookUser } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member { username: string | null; phone: string | null; name: string; id: string; }

export default function TgScraper() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: status } = useGetBotStatus({ query: { refetchInterval: 5000 } });
  const connected = !!status?.connected;

  const [link, setLink] = useState("");
  const [limit, setLimit] = useState("5000");
  const [members, setMembers] = useState<Member[]>([]);
  const [saveDialog, setSaveDialog] = useState(false);
  const [listName, setListName] = useState("");

  // One-click scrape+add state
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
    queryKey: ["add-status"],
    queryFn: () => apiGet("/scrape/add-status"),
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.active ? 1500 : false;
    },
  });

  const scrape = useMutation({
    mutationFn: () => apiPost("/scrape/group", { link, limit: parseInt(limit) || 5000 }),
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

  // One-click: scrape sourceGroup + immediately add to targetGroup
  const startAddDirect = useMutation({
    mutationFn: (data: { sourceGroup: string; targetGroup: string; limit: number }) =>
      apiPost("/scrape/add-members", data),
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
    mutationFn: (data: { targetGroup: string; members: Member[] }) =>
      apiPost("/scrape/add-members", data),
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
    mutationFn: () => apiPost("/scrape/add-stop", {}),
    onSuccess: () => {
      refetchAdd();
      toast({ title: "Add job stopped" });
    },
  });

  const startAddFromList = useMutation({
    mutationFn: (data: { listId: string; targetGroup: string }) =>
      apiPost("/scrape/add-from-list", data),
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

  const savedLists: any[] = listsData?.lists || [];
  const addJobActive = (addStatus as any)?.active;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Group Scraper</h1>
          <p className="text-sm text-muted-foreground mt-1">Pull members from a public Telegram group or channel</p>
        </div>

        {!connected && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Not logged in to Telegram</p>
                <p className="text-xs text-muted-foreground mt-0.5">Log in first — scraping uses your active Telegram session.</p>
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* ── One-click: Scrape & Auto-Add ─────────────────────────────────── */}
        <Card className={addJobActive ? "border-primary/30" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Scrape &amp; Auto-Add (One Click)
            </CardTitle>
            <CardDescription>Enter a source group and your target group — the bot scrapes and adds members automatically, no intermediate step</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {addJobActive ? (
              <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Source group (to steal from)</Label>
                    <Input
                      value={link}
                      onChange={e => setLink(e.target.value)}
                      placeholder="@sourcegroup or t.me/…"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Your target group/channel</Label>
                    <Input
                      value={scrapeAddTarget}
                      onChange={e => setScrapeAddTarget(e.target.value)}
                      placeholder="@mygroup or t.me/…"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-28 shrink-0">
                    <Label className="text-xs text-muted-foreground">Max members</Label>
                    <Input type="number" min={1} max={10000} value={limit} onChange={e => setLimit(e.target.value)} className="mt-1 h-9" />
                  </div>
                  <Button
                    className="flex-1"
                    onClick={() => startAddDirect.mutate({ sourceGroup: link.trim(), targetGroup: scrapeAddTarget.trim(), limit: parseInt(limit) || 5000 })}
                    disabled={!connected || !link.trim() || !scrapeAddTarget.trim() || startAddDirect.isPending}
                  >
                    {startAddDirect.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    {startAddDirect.isPending ? "Starting…" : "Scrape & Add"}
                  </Button>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                  <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Scrapes source group first, then adds members one-by-one with a 2–5s delay. You can still use the scrape tool below to inspect members before adding.
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
              {addJobActive ? (
                <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} />
              ) : (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Your group/channel @username or link</Label>
                    <Input
                      value={targetGroup}
                      onChange={e => setTargetGroup(e.target.value)}
                      placeholder="@mygroup or https://t.me/mygroup"
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => startAdd.mutate({ targetGroup: targetGroup.trim(), members })}
                    disabled={!targetGroup.trim() || startAdd.isPending || !connected}
                  >
                    {startAdd.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    {startAdd.isPending ? "Starting…" : `Add ${members.length} Members`}
                  </Button>
                  <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Adds one member every ~2–5 s to avoid flood limits. Users with privacy settings will be skipped automatically.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Live add-job progress even after members are cleared */}
        {!members.length && addJobActive && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" /> Add Job Running
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} />
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
                {addJobActive ? (
                  <AddJobProgress status={addStatus as any} onStop={() => stopAdd.mutate()} stopping={stopAdd.isPending} />
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
                      <Label className="text-xs text-muted-foreground">Target group/channel</Label>
                      <Input
                        value={addListTarget}
                        onChange={e => setAddListTarget(e.target.value)}
                        placeholder="@mygroup or https://t.me/mygroup"
                        className="mt-1 font-mono text-sm"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => startAddFromList.mutate({ listId: addListId, targetGroup: addListTarget.trim() })}
                      disabled={!addListId || !addListTarget.trim() || startAddFromList.isPending || !connected}
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

function AddJobProgress({ status, onStop, stopping }: { status: any; onStop: () => void; stopping: boolean }) {
  const pct = status?.percent ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-sm font-semibold">Adding members…</p>
          {(status?.floodWait ?? 0) > 0 && (
            <Badge variant="outline" className="text-orange-400 border-orange-400/40 text-xs">
              Flood wait {status.floodWait}s
            </Badge>
          )}
        </div>
        <Badge>{pct}%</Badge>
      </div>
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
      {/* Recent log */}
      {status?.log?.length > 0 && (
        <div className="max-h-36 overflow-y-auto divide-y divide-border rounded-md border">
          {[...(status.log as any[])].reverse().slice(0, 20).map((entry: any, i: number) => {
            const isAdded = entry.status === "added" || entry.status === "already";
            const isPrivacy = entry.status === "privacy";
            const isFail = entry.status === "failed" || entry.status === "skipped";
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                {isAdded ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  : isPrivacy ? <ShieldX className="w-3 h-3 text-yellow-500 shrink-0" />
                  : isFail ? <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                  : entry.status === "done" ? <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                  : <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />}
                <span className={cn("text-xs truncate flex-1", entry.status === "done" ? "text-primary font-medium" : "text-foreground")}>
                  {entry.msg || entry.name || entry.username}
                </span>
                {entry.error && <span className="text-xs text-muted-foreground truncate max-w-[100px]">{entry.error}</span>}
              </div>
            );
          })}
        </div>
      )}
      <Button variant="destructive" size="sm" className="w-full" onClick={onStop} disabled={stopping}>
        <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
      </Button>
    </div>
  );
}
