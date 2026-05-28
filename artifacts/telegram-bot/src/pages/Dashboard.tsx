import { useGetBotStatus, useGetSmsCampaignStatus, useGetCampaignStatus, useGetSmsHistory } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { MessageSquare, Send, Zap, Bot, Shield, Mic, Eye, TrendingUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function StatCard({ title, value, sub, icon: Icon, color = "text-primary" }: any) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: status, isLoading } = useGetBotStatus({ query: { refetchInterval: 5000 } });
  const { data: tgCampaign } = useGetCampaignStatus({ query: { refetchInterval: 3000 } });
  const { data: smsCampaign } = useGetSmsCampaignStatus({ query: { refetchInterval: 3000 } });
  const { data: smsHistory } = useGetSmsHistory({ query: { refetchInterval: 10000 } });

  const recentSms = smsHistory?.items?.slice(0, 5) || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">MFG Telegram Bot — Mirror AI + Campaigns + SMS</p>
        </div>

        {/* Not connected banner */}
        {!isLoading && !status?.connected && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <div>
                <p className="text-sm font-medium text-foreground">Not connected to Telegram</p>
                <p className="text-xs text-muted-foreground">Login to start using the bot</p>
              </div>
            </div>
            <Link href="/login">
              <button className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity" data-testid="button-login-now">
                Login Now
              </button>
            </Link>
          </div>
        )}

        {/* Status grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <StatCard
            title="Messages"
            value={status?.messages ?? "—"}
            sub="Total processed"
            icon={MessageSquare}
          />
          <StatCard
            title="Mirror AI"
            value={status?.aiEnabled ? "ON" : "OFF"}
            sub={status?.hasGroqKey ? "Groq connected" : "No Groq key"}
            icon={Bot}
            color={status?.aiEnabled ? "text-green-500" : "text-muted-foreground"}
          />
          <StatCard
            title="SMS Provider"
            value={status?.hasSmsKey ? "Ready" : "Not set"}
            sub="Configure in settings"
            icon={Zap}
            color={status?.hasSmsKey ? "text-green-500" : "text-yellow-500"}
          />
          <StatCard
            title="Uptime"
            value={status?.uptime !== undefined ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m` : "—"}
            sub="Server uptime"
            icon={Clock}
          />
        </div>

        {/* Feature flags */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Features</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[
              { label: "Anti-Scam", active: true, icon: Shield },
              { label: "Voice Transcription", active: true, icon: Mic },
              { label: "Image Vision", active: true, icon: Eye },
              { label: "SMM Panel", active: !!status?.hasSmmKey, icon: TrendingUp },
            ].map(({ label, active, icon: Icon }) => (
              <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium ${active ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                <Icon className="w-3 h-3" />
                {label}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Active campaigns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {/* TG Campaign */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Telegram Campaign</CardTitle>
                <Badge variant={tgCampaign?.active ? "default" : "secondary"} className="text-xs">
                  {tgCampaign?.active ? "Running" : "Idle"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {tgCampaign?.active ? (
                <div className="space-y-2">
                  <Progress value={tgCampaign.percent ?? 0} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tgCampaign.sent}/{tgCampaign.total} sent</span>
                    <span>{tgCampaign.percent ?? 0}%</span>
                  </div>
                  {tgCampaign.failed !== undefined && tgCampaign.failed > 0 && (
                    <p className="text-xs text-destructive">{tgCampaign.failed} failed</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No active campaign</p>
                  <Link href="/tg-campaign">
                    <button className="mt-2 text-xs text-primary hover:underline" data-testid="button-start-tg-campaign">Start Campaign →</button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SMS Campaign */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">SMS Campaign</CardTitle>
                <Badge variant={smsCampaign?.active ? "default" : "secondary"} className="text-xs">
                  {smsCampaign?.active ? "Running" : "Idle"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {smsCampaign?.active ? (
                <div className="space-y-2">
                  <Progress value={smsCampaign.percent ?? 0} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{smsCampaign.sent}/{smsCampaign.total} sent</span>
                    <span>{smsCampaign.percent ?? 0}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">via {smsCampaign.provider}</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No active SMS campaign</p>
                  <Link href="/sms-campaign">
                    <button className="mt-2 text-xs text-primary hover:underline" data-testid="button-start-sms-campaign">Start SMS Campaign →</button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SMS History */}
        {recentSms.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Recent SMS Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentSms.map((item: any) => (
                  <div key={item.id} data-testid={`sms-history-${item.id}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.status === "sent" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.phone}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.message}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <Badge variant={item.status === "sent" ? "default" : "destructive"} className="text-xs">{item.status}</Badge>
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
