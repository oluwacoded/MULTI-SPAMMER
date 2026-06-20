import { useState, useEffect } from "react";
import { useGetBotStatus, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import {
  Smartphone, KeyRound, Lock, CheckCircle2, LogOut, Plus, Users, Repeat,
  Trash2, Loader2, UserCircle2, ArrowLeft,
} from "lucide-react";

type Step = "phone" | "code" | "2fa" | "done";

interface Account {
  id: string;
  label: string;
  username: string | null;
  phone: string | null;
  name: string | null;
  hasOwnCreds: boolean;
  hasSession: boolean;
  active: boolean;
  connected: boolean;
}

export default function Login() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status } = useGetBotStatus({ query: { refetchInterval: 1500 } });
  const { data: acctData } = useQuery({
    queryKey: ["tg-accounts"],
    queryFn: () => apiGet("/tg-accounts"),
    refetchInterval: 3000,
  });
  const accounts: Account[] = (acctData as any)?.accounts || [];

  // login form state — mode "list" shows accounts; "login" runs the phone→code→2fa flow
  const [mode, setMode] = useState<"list" | "login">("list");
  const [target, setTarget] = useState<{ accountId?: string; isNew: boolean } | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [label, setLabel] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  // "armed" once the backend confirms THIS fresh login is in progress, so a stale
  // cached loginState ("connected" from a prior session) can't auto-complete it.
  const [loginArmed, setLoginArmed] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tg-accounts"] });
    qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
  };

  const resetForm = () => {
    setLabel(""); setApiId(""); setApiHash(""); setPhone(""); setCode(""); setPassword("");
    setStep("phone"); setTarget(null); setMode("list"); setLoginArmed(false);
  };

  const startAdd = () => { resetForm(); setTarget({ isNew: true }); setMode("login"); };
  const startRelogin = (id: string) => { resetForm(); setTarget({ accountId: id, isNew: false }); setMode("login"); };

  // The backend can't know synchronously whether a code triggers a 2FA prompt or
  // completes the login, so after submitting code/password we poll loginState and
  // let this effect drive the code → 2fa → done transitions. We only act once
  // "armed" (the backend has reported THIS login in progress), so a stale cached
  // "connected" from a prior session can't skip the code step.
  const loginState = (status as any)?.loginState as string | undefined;
  const pendingLogin = !!(status as any)?.pendingLogin;
  useEffect(() => {
    if (mode !== "login") return;
    if (!loginArmed) {
      if (pendingLogin || loginState === "awaiting_code" || loginState === "awaiting_password") setLoginArmed(true);
      return;
    }
    if (step === "code" && loginState === "awaiting_password") {
      setStep("2fa");
    } else if ((step === "code" || step === "2fa") && loginState === "connected") {
      setStep("done");
      refresh();
      setTimeout(resetForm, 2000);
    } else if ((step === "code" || step === "2fa") && loginState === "error") {
      toast({ title: "Login failed", description: (status as any)?.loginError || "Try again", variant: "destructive" });
      setStep("phone");
      setLoginArmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginState, pendingLogin, loginArmed, mode, step]);

  const loginStart = useMutation({
    mutationFn: () => apiPost("/login/start", {
      phone: phone.trim(),
      accountId: target?.accountId,
      createNew: target?.isNew || undefined,
      label: target?.isNew ? label.trim() || undefined : undefined,
      apiId: target?.isNew && apiId.trim() ? apiId.trim() : undefined,
      apiHash: target?.isNew && apiHash.trim() ? apiHash.trim() : undefined,
    }),
    onSuccess: (res: any) => {
      if (res.ok) {
        setStep("code");
        setLoginArmed(false);
        // refetch status so the effect arms on the fresh awaiting_code state
        qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
        toast({ title: "Code sent", description: "Check your Telegram app for the code" });
      } else toast({ title: "Couldn't send code", description: res.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const loginCode = useMutation({
    mutationFn: () => apiPost("/login/code", { code: code.trim() }),
    onSuccess: (res: any) => {
      if (!res.ok) toast({ title: "Error", description: res.message, variant: "destructive" });
      else toast({ title: "Verifying…" }); // transition handled by the loginState effect
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const login2fa = useMutation({
    mutationFn: () => apiPost("/login/2fa", { password: password.trim() }),
    onSuccess: (res: any) => {
      if (!res.ok) toast({ title: "Error", description: res.message, variant: "destructive" });
      else toast({ title: "Verifying…" }); // transition handled by the loginState effect
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const switchAccount = useMutation({
    mutationFn: (id: string) => apiPost(`/tg-accounts/${id}/active`, {}),
    onSuccess: (res: any) => {
      if (res.ok) { refresh(); toast({ title: "Switched account" }); }
      else toast({ title: "Couldn't switch", description: res.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const removeAccount = useMutation({
    mutationFn: (id: string) => apiDelete(`/tg-accounts/${id}`),
    onSuccess: (res: any) => {
      if (res.ok) { refresh(); toast({ title: "Account removed" }); }
      else toast({ title: "Couldn't remove", description: res.message, variant: "destructive" });
    },
    onError: (e: any) => toast({ title: "Request failed", description: e?.message, variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: () => apiPost("/bot/disconnect", {}),
    onSuccess: () => { refresh(); toast({ title: "Disconnected" }); },
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4 md:space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Telegram Accounts</h1>
            <p className="text-sm text-muted-foreground mt-1">Link one or more Telegram accounts and switch between them</p>
          </div>
          {mode === "list" && (
            <Button size="sm" onClick={startAdd} data-testid="button-add-account" className="shrink-0">
              <Plus className="w-4 h-4 mr-1.5" /> Add account
            </Button>
          )}
        </div>

        {mode === "list" && (
          <>
            {accounts.length === 0 && (
              <Card className="bg-muted/30">
                <CardContent className="p-6 text-center space-y-3">
                  <Users className="w-10 h-10 text-muted-foreground mx-auto" />
                  <div>
                    <p className="font-medium text-foreground">No accounts linked yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Add your first Telegram account to start scraping and running campaigns.</p>
                  </div>
                  <Button onClick={startAdd} data-testid="button-add-first"><Plus className="w-4 h-4 mr-1.5" /> Add account</Button>
                </CardContent>
              </Card>
            )}

            {accounts.map((a) => {
              const isConnected = a.connected && status?.connected;
              return (
                <Card key={a.id} className={a.active ? "border-primary/40" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserCircle2 className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground truncate">{a.label}</p>
                          {a.active && <Badge className="text-xs">Active</Badge>}
                          {isConnected
                            ? <Badge variant="outline" className="text-xs text-green-500 border-green-500/40">Connected</Badge>
                            : a.hasSession
                              ? <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/40">Offline</Badge>
                              : <Badge variant="outline" className="text-xs text-muted-foreground">Not logged in</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.username ? `@${a.username}` : a.name || "—"}{a.phone ? ` · ${a.phone}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {a.hasOwnCreds ? "Own API keys" : "Uses shared API keys"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!a.active && (
                        <Button size="sm" variant="outline" onClick={() => switchAccount.mutate(a.id)} disabled={switchAccount.isPending}>
                          <Repeat className="w-3.5 h-3.5 mr-1.5" /> Make active
                        </Button>
                      )}
                      {!a.hasSession || (a.active && !isConnected) ? (
                        <Button size="sm" onClick={() => startRelogin(a.id)}>
                          <Smartphone className="w-3.5 h-3.5 mr-1.5" /> {a.hasSession ? "Re-login" : "Log in"}
                        </Button>
                      ) : null}
                      {a.active && isConnected && (
                        <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                          <LogOut className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="text-muted-foreground hover:text-red-500 ml-auto"
                        onClick={() => { if (confirm(`Remove "${a.label}"? This deletes its saved session.`)) removeAccount.mutate(a.id); }}
                        disabled={removeAccount.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">How linking works</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span> Each account can use its own API ID/Hash (from my.telegram.org/apps), or leave them blank to use the shared keys set in Settings.</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span> One account is "Active" at a time — scraping, adding and campaigns all run as the active account.</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span> Anyone with access to this dashboard can use or remove every linked account — keep the URL private.</li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}

        {mode === "login" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {step === "phone" && (target?.isNew ? "Link a new account" : "Log in")}
                {step === "code" && "Enter verification code"}
                {step === "2fa" && "Two-factor authentication"}
                {step === "done" && "All done!"}
              </CardTitle>
              <CardDescription>
                {step === "phone" && "We'll send a code to the Telegram app. Include country code, e.g. +234…"}
                {step === "code" && "Telegram sent a code to that account's app"}
                {step === "2fa" && "This account has 2FA enabled — enter the cloud password"}
                {step === "done" && "Connecting your account…"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === "phone" && (
                <>
                  {target?.isNew && (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground">Account label (optional)</Label>
                        <Input data-testid="input-label" placeholder="e.g. Sales account" value={label} onChange={e => setLabel(e.target.value)} className="mt-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">API ID (optional)</Label>
                          <Input data-testid="input-api-id" placeholder="shared if blank" value={apiId} onChange={e => setApiId(e.target.value)} className="mt-1 font-mono" inputMode="numeric" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">API Hash (optional)</Label>
                          <Input data-testid="input-api-hash" placeholder="shared if blank" value={apiHash} onChange={e => setApiHash(e.target.value)} className="mt-1 font-mono" />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="input-phone"
                      placeholder="+2349012345678"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="pl-9"
                      onKeyDown={e => e.key === "Enter" && phone.trim() && loginStart.mutate()}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={resetForm}><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button>
                    <Button className="flex-1" onClick={() => loginStart.mutate()} disabled={loginStart.isPending || !phone.trim()} data-testid="button-send-code">
                      {loginStart.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {loginStart.isPending ? "Sending…" : "Send Code"}
                    </Button>
                  </div>
                </>
              )}

              {step === "code" && (
                <>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="input-code"
                      placeholder="12345"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      className="pl-9 text-center tracking-widest text-lg font-mono"
                      maxLength={8}
                      onKeyDown={e => e.key === "Enter" && code.trim() && loginCode.mutate()}
                    />
                  </div>
                  <Button className="w-full" onClick={() => loginCode.mutate()} disabled={loginCode.isPending || !code.trim()} data-testid="button-verify-code">
                    {loginCode.isPending ? "Verifying…" : "Verify Code"}
                  </Button>
                  <Button variant="ghost" className="w-full text-sm" onClick={resetForm}>← Cancel</Button>
                </>
              )}

              {step === "2fa" && (
                <>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="input-2fa"
                      type="password"
                      placeholder="Cloud password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-9"
                      onKeyDown={e => e.key === "Enter" && password.trim() && login2fa.mutate()}
                    />
                  </div>
                  <Button className="w-full" onClick={() => login2fa.mutate()} disabled={login2fa.isPending || !password.trim()} data-testid="button-submit-2fa">
                    {login2fa.isPending ? "Verifying…" : "Submit Password"}
                  </Button>
                  <Button variant="ghost" className="w-full text-sm" onClick={resetForm}>← Cancel</Button>
                </>
              )}

              {step === "done" && (
                <div className="text-center py-4 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="text-sm text-muted-foreground">Finishing up…</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
