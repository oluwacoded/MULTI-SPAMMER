import { useState } from "react";
import { useSendSmsFlash, useGetSmsHistory, useGetSmsProviders, getGetSmsHistoryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Zap, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function SmsFlash() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState("textbelt");
  const [senderId, setSenderId] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const sendFlash = useSendSmsFlash();
  const { data: history } = useGetSmsHistory({ query: { refetchInterval: 5000 } });
  const { data: providers } = useGetSmsProviders();

  const handleSend = () => {
    if (!phone.trim() || !message.trim()) {
      toast({ title: "Phone and message required", variant: "destructive" });
      return;
    }
    sendFlash.mutate({ data: { phone: phone.trim(), message: message.trim(), provider, senderId: senderId || null } }, {
      onSuccess: (res) => {
        if (res.ok) {
          qc.invalidateQueries({ queryKey: getGetSmsHistoryQueryKey() });
          toast({ title: "SMS Sent!", description: `via ${res.provider}${res.messageId ? ` • ID: ${res.messageId}` : ""}` });
          setPhone(""); setMessage("");
        } else {
          toast({ title: "Send failed", description: res.message, variant: "destructive" });
        }
      }
    });
  };

  const items = history?.items || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SMS Flash</h1>
          <p className="text-sm text-muted-foreground mt-1">Send a single SMS instantly to any number</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> Send Flash SMS</CardTitle>
            <CardDescription>Instant single SMS delivery via your configured provider</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Recipient Phone Number</p>
              <Input
                data-testid="input-flash-phone"
                placeholder="+2349012345678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Provider</p>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger data-testid="select-flash-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers?.providers?.length ? providers.providers.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-1.5">
                          {p.configured ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-muted-foreground" />}
                          {p.name}
                        </div>
                      </SelectItem>
                    )) : (
                      <>
                        <SelectItem value="textbelt">Textbelt</SelectItem>
                        <SelectItem value="twilio">Twilio</SelectItem>
                        <SelectItem value="termii">Termii</SelectItem>
                        <SelectItem value="africas_talking">Africa's Talking</SelectItem>
                        <SelectItem value="bulksms_ng">BulkSMS Nigeria</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Sender ID (optional)</p>
                <Input
                  data-testid="input-flash-sender"
                  placeholder="MFGBot"
                  value={senderId}
                  onChange={e => setSenderId(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Message</p>
              <Textarea
                data-testid="input-flash-message"
                placeholder="Type your SMS message here..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="h-24 resize-none"
                maxLength={160}
              />
              <p className="text-xs text-muted-foreground text-right mt-1">{message.length}/160</p>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSend}
              disabled={sendFlash.isPending || !phone.trim() || !message.trim()}
              data-testid="button-send-flash"
            >
              <Zap className="w-4 h-4 mr-2" />
              {sendFlash.isPending ? "Sending..." : "Send Flash SMS"}
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Send History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {items.map((item: any) => (
                  <div key={item.id} data-testid={`flash-history-${item.id}`} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                    {item.status === "sent" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.phone}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.message}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={item.status === "sent" ? "default" : "destructive"} className="text-xs">{item.provider}</Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(item.at), { addSuffix: true })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
