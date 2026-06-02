import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetBotStatus } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiPost, apiGet } from "@/lib/api";
import { Users, Download, Search, Loader2, Info, Save, AlertTriangle, Phone, AtSign } from "lucide-react";

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

  const { data: listsData } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => apiGet("/contact-lists"),
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

  const withPhone = members.filter(m => m.phone);
  const withUsername = members.filter(m => m.username);

  const handleSave = () => {
    // Save as contacts. Prefer phone, fall back to @username as the identifier.
    const contacts = members
      .map(m => ({
        phone: m.phone || (m.username ? `@${m.username}` : ""),
        name: m.name,
        username: m.username || undefined,
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
              <div className="max-h-96 overflow-y-auto divide-y divide-border">
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
