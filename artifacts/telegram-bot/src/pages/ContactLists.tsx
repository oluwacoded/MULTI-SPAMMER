import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BookUser, Trash2, Eye, ShieldOff, Plus } from "lucide-react";

export default function ContactLists() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [viewList, setViewList] = useState<any | null>(null);
  const [blacklistDialog, setBlacklistDialog] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const { data: listsData, isLoading: listsLoading } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: async () => { const r = await fetch("/api/contact-lists"); return r.json(); },
  });

  const { data: listDetail } = useQuery({
    queryKey: ["contact-list", viewList?.id],
    queryFn: async () => {
      if (!viewList?.id) return null;
      const r = await fetch(`/api/contact-lists/${viewList.id}`);
      return r.json();
    },
    enabled: !!viewList?.id,
  });

  const { data: blacklistData, isLoading: blLoading } = useQuery({
    queryKey: ["blacklist"],
    queryFn: async () => { const r = await fetch("/api/blacklist"); return r.json(); },
  });

  const delList = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/contact-lists/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
      toast({ title: "List deleted" });
    },
  });

  const addToBlacklist = useMutation({
    mutationFn: async (phone: string) => {
      const r = await fetch("/api/blacklist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      setNewPhone("");
      toast({ title: "Added to blacklist" });
    },
  });

  const removeFromBlacklist = useMutation({
    mutationFn: async (phone: string) => {
      await fetch(`/api/blacklist/${encodeURIComponent(phone)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      toast({ title: "Removed from blacklist" });
    },
  });

  const clearBlacklist = useMutation({
    mutationFn: async () => {
      await fetch("/api/blacklist", { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      toast({ title: "Blacklist cleared" });
    },
  });

  const blacklistFromList = useMutation({
    mutationFn: async (phones: string[]) => {
      const r = await fetch("/api/blacklist/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["blacklist"] });
      toast({ title: `Added to blacklist`, description: `Blacklist now has ${data.count} numbers` });
      setViewList(null);
    },
  });

  const lists = listsData?.lists || [];
  const blacklist: string[] = blacklistData?.phones || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookUser className="w-6 h-6" /> Contact Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Saved contact lists and opt-out blacklist management</p>
        </div>

        {/* Saved Lists */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">Saved Lists</CardTitle>
          </CardHeader>
          <CardContent>
            {listsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!listsLoading && lists.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No saved lists yet. Load contacts on TG Campaign and click "Save as list".
              </p>
            )}
            <div className="space-y-2">
              {lists.map((list: any) => (
                <div key={list.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{list.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {list.count} contacts · {list.createdAt ? new Date(list.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setViewList(list)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                    onClick={() => delList.mutate(list.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Blacklist */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldOff className="w-4 h-4 text-red-500" /> Opt-out Blacklist
                <Badge variant="outline">{blacklist.length}</Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => setBlacklistDialog(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
                {blacklist.length > 0 && (
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => clearBlacklist.mutate()}>
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {blLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!blLoading && blacklist.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No blocked numbers. Numbers added here are automatically skipped during campaigns.
              </p>
            )}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {blacklist.map((phone, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-muted/30">
                  <span className="text-sm font-mono text-foreground">{phone}</span>
                  <Button
                    size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => removeFromBlacklist.mutate(phone)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* View list detail dialog */}
        <Dialog open={!!viewList} onOpenChange={v => !v && setViewList(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{viewList?.name}</DialogTitle>
              <DialogDescription>{viewList?.count} contacts</DialogDescription>
            </DialogHeader>
            <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-md border border-border">
              {(listDetail?.contacts || []).slice(0, 100).map((c: any, i: number) => (
                <div key={i} className="px-3 py-1.5 flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground">{c.phone}</span>
                  {c.name && c.name !== c.phone && <span className="text-xs text-muted-foreground truncate">{c.name}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline" size="sm" className="flex-1 text-red-500"
                onClick={() => {
                  if (listDetail?.contacts) {
                    blacklistFromList.mutate(listDetail.contacts.map((c: any) => c.phone));
                  }
                }}
                disabled={blacklistFromList.isPending}
              >
                <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                Blacklist all
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewList(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add to blacklist dialog */}
        <Dialog open={blacklistDialog} onOpenChange={setBlacklistDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Add to Blacklist</DialogTitle>
              <DialogDescription>Phone numbers added here will be skipped in all future campaigns.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Phone number</Label>
                <Input
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="+12345678901"
                  className="mt-1 font-mono text-sm"
                  onKeyDown={e => e.key === "Enter" && newPhone && addToBlacklist.mutate(newPhone)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => addToBlacklist.mutate(newPhone)}
                disabled={!newPhone || addToBlacklist.isPending}
              >
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
