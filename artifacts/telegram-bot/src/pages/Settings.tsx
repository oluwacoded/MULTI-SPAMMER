import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Bot, Shield, Mic, Eye, MessageCircle, Settings2, Zap, Save } from "lucide-react";

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (settings && !form) setForm({ ...settings });
  }, [settings]);

  const set = (key: string, val: any) => setForm((prev: any) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form) return;
    updateSettings.mutate({ data: form }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Settings saved!" });
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" })
    });
  };

  if (isLoading || !form) {
    return <Layout><div className="p-6 text-center text-muted-foreground">Loading settings...</div></Layout>;
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure bot behavior and integrations</p>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-settings" className="shrink-0">
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Bot basics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Bot Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Command Prefix</Label>
                <Input
                  data-testid="input-prefix"
                  value={form.prefix || "."}
                  onChange={e => set("prefix", e.target.value.slice(0, 1))}
                  className="mt-1 font-mono text-center w-16"
                  maxLength={1}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Bot Name</Label>
                <Input
                  data-testid="input-bot-name"
                  value={form.botName || ""}
                  onChange={e => set("botName", e.target.value)}
                  className="mt-1"
                  placeholder="mfg_tgbot"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mirror AI */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4" /> Mirror AI</CardTitle>
            <CardDescription>Auto-reply to DMs in your style using Groq</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable Mirror AI</Label>
              <Switch
                data-testid="switch-ai-enabled"
                checked={!!form.aiEnabled}
                onCheckedChange={v => set("aiEnabled", v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">AI Disclaimer</Label>
              <Switch
                data-testid="switch-ai-disclaimer"
                checked={!!form.aiDisclaimer}
                onCheckedChange={v => set("aiDisclaimer", v)}
              />
            </div>
            {form.aiDisclaimer && (
              <div>
                <Label className="text-xs text-muted-foreground">Disclaimer text</Label>
                <Textarea
                  data-testid="input-disclaimer-text"
                  value={form.disclaimerText || ""}
                  onChange={e => set("disclaimerText", e.target.value)}
                  className="mt-1 h-16 text-xs resize-none"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Mood Awareness</Label>
              <Switch
                data-testid="switch-mood"
                checked={!!form.moodAware}
                onCheckedChange={v => set("moodAware", v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Auto Takeover (pause AI when you reply)</Label>
              <Switch
                data-testid="switch-takeover"
                checked={!!form.autoTakeover}
                onCheckedChange={v => set("autoTakeover", v)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">AI Response Delay (seconds)</Label>
              <Input
                data-testid="input-ai-delay"
                type="number"
                min={0} max={30}
                value={form.aiDelay ?? 0}
                onChange={e => set("aiDelay", parseInt(e.target.value) || 0)}
                className="mt-1 w-24"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">System Prompt</Label>
              <Textarea
                data-testid="input-system-prompt"
                value={form.systemPrompt || ""}
                onChange={e => set("systemPrompt", e.target.value)}
                className="mt-1 h-32 text-xs resize-none font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* Safety */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> Safety & Privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Anti-Scam Detection</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Alert when scam patterns are detected</p>
              </div>
              <Switch
                data-testid="switch-antiscam"
                checked={!!form.antiScam}
                onCheckedChange={v => set("antiScam", v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Voice Transcription</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Transcribe voice notes with Groq Whisper</p>
              </div>
              <Switch
                data-testid="switch-transcribe"
                checked={!!form.transcribeVoice}
                onCheckedChange={v => set("transcribeVoice", v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Image Vision</Label>
                <p className="text-xs text-muted-foreground mt-0.5">AI describes photos you receive</p>
              </div>
              <Switch
                data-testid="switch-vision"
                checked={!!form.visionEnabled}
                onCheckedChange={v => set("visionEnabled", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* SMS settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4" /> SMS Configuration</CardTitle>
            <CardDescription>Configure your SMS provider for campaigns and flash SMS</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Default SMS Provider</Label>
              <Select value={form.smsProvider || "textbelt"} onValueChange={v => set("smsProvider", v)}>
                <SelectTrigger className="mt-1" data-testid="select-sms-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="textbelt">Textbelt (free tier)</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="termii">Termii (Nigeria)</SelectItem>
                  <SelectItem value="africas_talking">Africa's Talking</SelectItem>
                  <SelectItem value="bulksms_ng">BulkSMS Nigeria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">SMS API Key</Label>
              <Input
                data-testid="input-sms-api-key"
                type="password"
                value={form.smsApiKey || ""}
                onChange={e => set("smsApiKey", e.target.value)}
                className="mt-1 font-mono"
                placeholder="Your provider API key"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Default Sender ID</Label>
              <Input
                data-testid="input-sms-sender-id"
                value={form.smsSenderId || ""}
                onChange={e => set("smsSenderId", e.target.value)}
                className="mt-1"
                placeholder="MFGBot"
              />
            </div>
            <div className="p-3 rounded-md bg-muted/50 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Required Environment Variables</p>
              <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground font-mono">
                <p>TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER</p>
                <p>TERMII_API_KEY, TERMII_SENDER_ID</p>
                <p>AT_API_KEY, AT_USERNAME, AT_SENDER_ID</p>
                <p>BULKSMS_API_KEY</p>
                <p>TEXTBELT_API_KEY (or use "textbelt" for 1 free/day)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SMM Panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><MessageCircle className="w-4 h-4" /> SMM Panel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Markup %</Label>
                <Input
                  data-testid="input-smm-markup"
                  type="number" min={0} max={200}
                  value={form.smmMarkup ?? 20}
                  onChange={e => set("smmMarkup", parseInt(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">NGN/USD Rate</Label>
                <Input
                  data-testid="input-ngn-rate"
                  type="number"
                  value={form.smmNGNRate ?? 1600}
                  onChange={e => set("smmNGNRate", parseInt(e.target.value) || 1600)}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleSave} disabled={updateSettings.isPending} data-testid="button-save-settings-bottom">
          <Save className="w-4 h-4 mr-2" />
          {updateSettings.isPending ? "Saving..." : "Save All Settings"}
        </Button>
      </div>
    </Layout>
  );
}
