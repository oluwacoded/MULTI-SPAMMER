import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey, setBaseUrl } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost } from "@/lib/api";
import { Bot, Shield, Mic, Eye, MessageCircle, Settings2, Zap, Save, Server, Plus, Trash2, Check, KeyRound } from "lucide-react";

function TelegramCredsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["tg-credentials"], queryFn: () => apiGet("/tg-credentials") });
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");

  const save = useMutation({
    mutationFn: () => apiPost("/tg-credentials", { apiId, apiHash }),
    onSuccess: (res: any) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["tg-credentials"] });
        setApiId(""); setApiHash("");
        toast({ title: "Telegram API keys saved", description: res.message });
      } else {
        toast({ title: "Couldn't save", description: res.message, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><KeyRound className="w-4 h-4" /> Shared Telegram API Keys</CardTitle>
        <CardDescription>Fallback keys used by any account that doesn't have its own. Accounts can override these on the Accounts page. Get them free at my.telegram.org → API development tools.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${data?.hasCreds ? "bg-green-500" : "bg-yellow-500"}`} />
          <p className="text-xs text-muted-foreground">{data?.hasCreds ? "API keys are configured" : "Not configured yet"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">API ID</Label>
            <Input value={apiId} onChange={e => setApiId(e.target.value)} placeholder="1234567" className="mt-1 font-mono" inputMode="numeric" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">API Hash</Label>
            <Input value={apiHash} onChange={e => setApiHash(e.target.value)} placeholder={data?.hasCreds ? "•••••• (leave blank to keep)" : "abcdef0123…"} className="mt-1 font-mono" />
          </div>
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={!apiId.trim() || !apiHash.trim() || save.isPending}>
          {save.isPending ? "Saving…" : "Save API Keys"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ApiServersCard() {
  const { toast } = useToast();
  const [servers, setServers] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("mfg_api_servers") || "[]"); } catch { return []; }
  });
  const [current, setCurrent] = useState(() => localStorage.getItem("mfg_api_base") || "");
  const [newUrl, setNewUrl] = useState("");
  const [saved, setSaved] = useState(false);

  const apply = (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (trimmed) {
      localStorage.setItem("mfg_api_base", trimmed);
      setBaseUrl(trimmed);
    } else {
      localStorage.removeItem("mfg_api_base");
      setBaseUrl(null);
    }
    setCurrent(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast({ title: trimmed ? `Now using: ${trimmed}` : "Using local server" });
  };

  const addServer = () => {
    const trimmed = newUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return;
    const next = [...new Set([...servers, trimmed])];
    setServers(next);
    localStorage.setItem("mfg_api_servers", JSON.stringify(next));
    apply(trimmed);
    setNewUrl("");
  };

  const removeServer = (url: string) => {
    const next = servers.filter(s => s !== url);
    setServers(next);
    localStorage.setItem("mfg_api_servers", JSON.stringify(next));
    if (current === url) apply("");
  };

  const allOptions = [...new Set([...servers, current].filter(Boolean))];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Server className="w-4 h-4" /> API Server</CardTitle>
        <CardDescription>Point the dashboard to a different backend. Useful when running multiple bot instances.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Active server</Label>
          <p className="text-sm font-mono text-foreground mt-1 truncate">
            {current || <span className="text-muted-foreground italic">Local (same origin)</span>}
          </p>
        </div>
        {allOptions.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Saved servers</Label>
            {allOptions.map(url => (
              <div key={url} className="flex items-center gap-2">
                <button
                  className={`flex-1 text-left text-xs font-mono px-3 py-2 rounded-md border transition-colors truncate ${
                    current === url
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => apply(url)}
                >
                  {url.replace(/^https?:\/\//, "")}
                </button>
                {current === url && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-red-500" onClick={() => removeServer(url)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div>
          <Label className="text-xs text-muted-foreground">Add new server URL</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addServer()}
              placeholder="https://api.yourdomain.com"
              className="flex-1 font-mono text-xs h-8"
            />
            <Button size="sm" onClick={addServer} disabled={!newUrl.trim()} className="h-8 shrink-0">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => apply("")}>
          Reset to local server
        </Button>
      </CardContent>
    </Card>
  );
}

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

        <ApiServersCard />

        <TelegramCredsCard />

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
