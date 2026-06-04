import { useMemo, useState } from "react";
import { useDevices, useContacts, useSendMessage, useSendBatch, useBatches } from "@/lib/hooks";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Users, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

function DeviceSelect({
  value,
  onChange,
  devices,
}: {
  value: string;
  onChange: (v: string) => void;
  devices: { id: number; name: string; phoneNumber: string | null }[] | undefined;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a device to send from..." />
      </SelectTrigger>
      <SelectContent>
        {devices?.map((d) => (
          <SelectItem key={d.id} value={d.id.toString()}>
            {d.name} ({d.phoneNumber || "no number"})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Compose() {
  const { toast } = useToast();
  const { data: devices } = useDevices();
  const { data: contacts } = useContacts();
  const sendMessage = useSendMessage();
  const sendBatch = useSendBatch();
  const { data: batches } = useBatches();

  // single
  const [singleDevice, setSingleDevice] = useState("");
  const [singleTo, setSingleTo] = useState("");
  const [singleBody, setSingleBody] = useState("");

  // batch
  const [batchDevice, setBatchDevice] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchBody, setBatchBody] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);

  const noDevices = devices?.length === 0;

  const parsedRecipients = useMemo(() => {
    return recipientsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [phone, ...nameParts] = line.split(",");
        return { phone: phone.trim(), name: nameParts.join(",").trim() || null };
      })
      .filter((r) => r.phone);
  }, [recipientsText]);

  const totalBatchRecipients = parsedRecipients.length + selectedContacts.length;

  const handleSingleSend = async () => {
    if (!singleDevice || !singleTo.trim() || !singleBody.trim()) return;
    try {
      await sendMessage.mutateAsync({
        deviceId: parseInt(singleDevice, 10),
        to: singleTo,
        body: singleBody,
      });
      toast({ title: "Message sent", description: `Sent to ${singleTo}.` });
      setSingleBody("");
      setSingleTo("");
    } catch (e) {
      toast({
        title: "Send failed",
        description: e instanceof Error ? e.message : "Could not send message.",
        variant: "destructive",
      });
    }
  };

  const handleBatchSend = async () => {
    if (!batchDevice || !batchBody.trim() || totalBatchRecipients === 0) return;
    try {
      await sendBatch.mutateAsync({
        deviceId: parseInt(batchDevice, 10),
        name: batchName || undefined,
        body: batchBody,
        recipients: parsedRecipients.length > 0 ? parsedRecipients : undefined,
        contactIds: selectedContacts.length > 0 ? selectedContacts : undefined,
      });
      toast({
        title: "Batch started",
        description: `Sending to ${totalBatchRecipients} recipient(s).`,
      });
      setBatchBody("");
      setBatchName("");
      setRecipientsText("");
      setSelectedContacts([]);
    } catch (e) {
      toast({
        title: "Batch failed",
        description: e instanceof Error ? e.message : "Could not start batch.",
        variant: "destructive",
      });
    }
  };

  const toggleContact = (id: number) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compose</h1>
        <p className="text-muted-foreground mt-1">Send a single message or a bulk campaign.</p>
      </div>

      {noDevices && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">
            You need to add a device before you can send.{" "}
            <Link href="/settings" className="font-semibold underline">
              Go to Settings
            </Link>
          </span>
        </div>
      )}

      <Tabs defaultValue="single" className="max-w-3xl">
        <TabsList>
          <TabsTrigger value="single">Single</TabsTrigger>
          <TabsTrigger value="batch">Batch</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>Single message</CardTitle>
              <CardDescription>Send one SMS to one recipient.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Device</Label>
                <DeviceSelect value={singleDevice} onChange={setSingleDevice} devices={devices} />
              </div>
              <div className="space-y-2">
                <Label>Recipient phone number</Label>
                <Input
                  value={singleTo}
                  onChange={(e) => setSingleTo(e.target.value)}
                  placeholder="+15551234567"
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={singleBody}
                  onChange={(e) => setSingleBody(e.target.value)}
                  placeholder="Type your message..."
                  rows={4}
                />
                <div className="text-xs text-muted-foreground">{singleBody.length} characters</div>
              </div>
              <Button
                onClick={handleSingleSend}
                disabled={!singleDevice || !singleTo.trim() || !singleBody.trim() || sendMessage.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMessage.isPending ? "Sending..." : "Send message"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batch">
          <Card>
            <CardHeader>
              <CardTitle>Batch send</CardTitle>
              <CardDescription>
                Send to many recipients. Use {"{name}"} in the message to personalize.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Device</Label>
                <DeviceSelect value={batchDevice} onChange={setBatchDevice} devices={devices} />
              </div>
              <div className="space-y-2">
                <Label>Campaign name (optional)</Label>
                <Input
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Spring promo"
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={batchBody}
                  onChange={(e) => setBatchBody(e.target.value)}
                  placeholder="Hi {name}, ..."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Paste recipients (one per line: phone or phone,name)</Label>
                <Textarea
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  placeholder={"+15551234567,Alex\n+15557654321,Sam"}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>

              {contacts && contacts.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" /> Or pick from contacts
                  </Label>
                  <ScrollArea className="h-40 rounded-md border p-2">
                    {contacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedContacts.includes(c.id)}
                          onCheckedChange={() => toggleContact(c.id)}
                        />
                        <span className="text-sm font-medium">{c.name || "Unnamed"}</span>
                        <span className="text-sm text-muted-foreground font-mono">{c.phoneNumber}</span>
                      </label>
                    ))}
                  </ScrollArea>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {totalBatchRecipients} recipient(s) selected
                </span>
                <Button
                  onClick={handleBatchSend}
                  disabled={!batchDevice || !batchBody.trim() || totalBatchRecipients === 0 || sendBatch.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendBatch.isPending ? "Starting..." : "Start batch"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {batches && batches.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Recent batches</CardTitle>
                <CardDescription>Live progress of bulk sends.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {batches.map((b) => {
                  const done = b.sent + b.failed;
                  const pct = b.total > 0 ? Math.round((done / b.total) * 100) : 0;
                  return (
                    <div key={b.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">
                          {b.name || `Batch #${b.id}`}
                          <span className="text-muted-foreground ml-2 font-normal">
                            {format(new Date(b.createdAt), "MMM d, HH:mm")}
                          </span>
                        </div>
                        <Badge variant={b.status === "failed" ? "destructive" : b.status === "done" ? "default" : "secondary"}>
                          {b.status}
                        </Badge>
                      </div>
                      <Progress value={pct} />
                      <div className="text-xs text-muted-foreground">
                        {b.sent} sent · {b.failed} failed · {b.total} total
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
