import { useState, useRef } from "react";
import { useGetSmsCampaignStatus, useStartSmsCampaign, useStopSmsCampaign, useGetSmsProviders, getGetSmsCampaignStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Play, Square, Users, MessageSquare, Info, CheckCircle2, XCircle } from "lucide-react";

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
  return text.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length >= 7).map(phone => {
    phone = phone.replace(/[^\d+]/g, "");
    if (!phone.startsWith("+")) phone = "+" + phone;
    return { phone, name: phone };
  }).filter(c => c.phone.length >= 8);
}

export default function SmsCampaign() {
  const [contacts, setContacts] = useState<Array<{ phone: string; name: string }>>([]);
  const [message, setMessage] = useState("Hey {name}! Check this out.");
  const [rawInput, setRawInput] = useState("");
  const [provider, setProvider] = useState("textbelt");
  const [senderId, setSenderId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status } = useGetSmsCampaignStatus({ query: { refetchInterval: 2000 } });
  const { data: providers } = useGetSmsProviders();
  const startCampaign = useStartSmsCampaign();
  const stopCampaign = useStopSmsCampaign();

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

  const handleStart = () => {
    if (!contacts.length) { toast({ title: "No contacts", variant: "destructive" }); return; }
    if (!message.trim()) { toast({ title: "Enter a message", variant: "destructive" }); return; }
    startCampaign.mutate({ data: { contacts, message, provider, senderId: senderId || null } }, {
      onSuccess: (res) => {
        if (res.ok) {
          qc.invalidateQueries({ queryKey: getGetSmsCampaignStatusQueryKey() });
          toast({ title: "SMS Campaign started!", description: `Sending to ${contacts.length} contacts via ${provider}` });
        } else {
          toast({ title: "Error", description: res.message || "Failed to start SMS campaign", variant: "destructive" });
        }
      },
      onError: (err: any) => {
        toast({ title: "Request failed", description: err?.message || "Could not reach the server", variant: "destructive" });
      }
    });
  };

  const handleStop = () => {
    stopCampaign.mutate({}, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSmsCampaignStatusQueryKey() });
        toast({ title: "SMS Campaign stopped" });
      }
    });
  };

  const providerList = providers?.providers || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SMS Campaign</h1>
          <p className="text-sm text-muted-foreground mt-1">Bulk SMS flasher — send to thousands with personalisation</p>
        </div>

        {/* Active status */}
        {status?.active && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm font-semibold">SMS Campaign Running</p>
                </div>
                <Badge>{status.percent ?? 0}%</Badge>
              </div>
              <Progress value={status.percent ?? 0} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>✔ {status.sent} sent | ✖ {status.failed} failed</span>
                <span>~{status.remain} min left | via {status.provider}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={handleStop} disabled={stopCampaign.isPending} data-testid="button-stop-sms-campaign" className="w-full">
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop Campaign
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Provider select */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">SMS Provider</CardTitle>
            <CardDescription>Choose your provider. Configure API keys in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger data-testid="select-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providerList.length > 0 ? providerList.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      {p.configured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                      {p.name}
                      {!p.configured && <span className="text-xs text-muted-foreground">(not configured)</span>}
                    </div>
                  </SelectItem>
                )) : (
                  <>
                    <SelectItem value="textbelt">Textbelt (free tier)</SelectItem>
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="termii">Termii (Nigeria)</SelectItem>
                    <SelectItem value="africas_talking">Africa's Talking</SelectItem>
                    <SelectItem value="bulksms_ng">BulkSMS Nigeria</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Sender ID (optional)</p>
              <Input
                data-testid="input-sender-id"
                placeholder="MFGBot or +1234567890"
                value={senderId}
                onChange={e => setSenderId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Contacts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Contacts</CardTitle>
            <CardDescription>VCF, CSV, or paste phone numbers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept=".vcf,.csv,.txt" className="hidden" onChange={handleFile} data-testid="input-file-sms" />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} data-testid="button-upload-sms-contacts">
              <Upload className="w-4 h-4 mr-2" />
              Upload VCF / CSV file
            </Button>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Or paste phone numbers</p>
              <Textarea
                data-testid="input-sms-phone-list"
                placeholder="+2349012345678&#10;+2348012345678&#10;+447911123456"
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                className="font-mono text-xs h-24 resize-none"
              />
              <Button size="sm" variant="secondary" className="mt-2" onClick={handleRawParse} data-testid="button-parse-sms-phones">
                Parse Numbers
              </Button>
            </div>
            {contacts.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/20">
                <Users className="w-3.5 h-3.5 text-green-500" />
                <p className="text-xs text-green-500 font-medium">{contacts.length} contacts loaded</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              data-testid="input-sms-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="h-28 resize-none"
              placeholder="Your SMS message..."
              maxLength={160}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50 flex-1">
                <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">{"{name}"}</code> and <code className="bg-muted px-1 rounded">{"{phone}"}</code> for personalisation
                </p>
              </div>
              <p className="text-xs text-muted-foreground ml-3 shrink-0">{message.length}/160</p>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={handleStart}
          disabled={startCampaign.isPending || status?.active || !contacts.length}
          data-testid="button-start-sms-campaign"
        >
          <Play className="w-4 h-4 mr-2" />
          {startCampaign.isPending ? "Starting..." : `Send SMS to ${contacts.length || "?"} Contacts`}
        </Button>
      </div>
    </Layout>
  );
}
