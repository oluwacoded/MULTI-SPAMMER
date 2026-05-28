import { useState } from "react";
import { useLoginStart, useLoginCode, useLogin2fa, useDisconnectBot, useGetBotStatus, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, KeyRound, Lock, CheckCircle2, LogOut } from "lucide-react";

type Step = "phone" | "code" | "2fa" | "done";

export default function Login() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status } = useGetBotStatus({ query: { refetchInterval: 3000 } });

  const loginStart = useLoginStart();
  const loginCode = useLoginCode();
  const login2fa = useLogin2fa();
  const disconnect = useDisconnectBot();

  const handlePhone = () => {
    if (!phone.trim()) return;
    loginStart.mutate({ data: { phone: phone.trim() } }, {
      onSuccess: (res) => {
        if (res.ok) {
          setStep("code");
          toast({ title: "Code sent", description: "Check your Telegram for the verification code" });
        } else {
          toast({ title: "Error", description: res.message, variant: "destructive" });
        }
      }
    });
  };

  const handleCode = () => {
    if (!code.trim()) return;
    loginCode.mutate({ data: { code: code.trim() } }, {
      onSuccess: (res) => {
        if (res.ok) {
          qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
          toast({ title: "Success", description: "Logged in!" });
          setStep("done");
        } else if (res.message?.toLowerCase().includes("2fa") || res.message?.toLowerCase().includes("password")) {
          setStep("2fa");
        } else {
          toast({ title: "Error", description: res.message, variant: "destructive" });
        }
      }
    });
  };

  const handle2fa = () => {
    if (!password.trim()) return;
    login2fa.mutate({ data: { password: password.trim() } }, {
      onSuccess: (res) => {
        if (res.ok) {
          qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
          toast({ title: "Success", description: "Logged in with 2FA!" });
          setStep("done");
        } else {
          toast({ title: "Error", description: res.message, variant: "destructive" });
        }
      }
    });
  };

  const handleDisconnect = () => {
    disconnect.mutate({}, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
        setStep("phone");
        setCode(""); setPhone(""); setPassword("");
        toast({ title: "Disconnected", description: "Telegram session ended" });
      }
    });
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telegram Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect your Telegram account to the bot</p>
        </div>

        {status?.connected ? (
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <p className="font-semibold text-foreground text-lg">Connected</p>
                {status.me && (
                  <p className="text-muted-foreground text-sm">@{status.me.username || status.me.name} ({status.me.phone})</p>
                )}
              </div>
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                data-testid="button-disconnect"
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {step === "phone" && "Enter your phone number"}
                {step === "code" && "Enter verification code"}
                {step === "2fa" && "Two-factor authentication"}
                {step === "done" && "All done!"}
              </CardTitle>
              <CardDescription>
                {step === "phone" && "We'll send a code to your Telegram app. Include country code, e.g. +2349..."}
                {step === "code" && "Telegram sent a 5-digit code to your app"}
                {step === "2fa" && "Your account has 2FA enabled — enter your cloud password"}
                {step === "done" && "The bot is now running as your Telegram account"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === "phone" && (
                <>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      data-testid="input-phone"
                      placeholder="+2349012345678"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="pl-9"
                      onKeyDown={e => e.key === "Enter" && handlePhone()}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handlePhone}
                    disabled={loginStart.isPending || !phone.trim()}
                    data-testid="button-send-code"
                  >
                    {loginStart.isPending ? "Sending..." : "Send Code"}
                  </Button>
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
                      onKeyDown={e => e.key === "Enter" && handleCode()}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCode}
                    disabled={loginCode.isPending || !code.trim()}
                    data-testid="button-verify-code"
                  >
                    {loginCode.isPending ? "Verifying..." : "Verify Code"}
                  </Button>
                  <Button variant="ghost" className="w-full text-sm" onClick={() => setStep("phone")}>
                    ← Back
                  </Button>
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
                      onKeyDown={e => e.key === "Enter" && handle2fa()}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handle2fa}
                    disabled={login2fa.isPending || !password.trim()}
                    data-testid="button-submit-2fa"
                  >
                    {login2fa.isPending ? "Verifying..." : "Submit Password"}
                  </Button>
                </>
              )}

              {step === "done" && (
                <div className="text-center py-4 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="text-sm text-muted-foreground">Refreshing status...</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Setup Requirements</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span> Set <code className="bg-muted px-1 rounded">TG_API_ID</code> and <code className="bg-muted px-1 rounded">TG_API_HASH</code> env vars (from my.telegram.org/apps)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span> Set <code className="bg-muted px-1 rounded">GROQ_API_KEY</code> for Mirror AI + voice (free at console.groq.com)</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span> Set SMS provider keys in Settings for SMS campaigns</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
