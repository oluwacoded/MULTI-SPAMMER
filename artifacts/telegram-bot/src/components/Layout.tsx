import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Send, MessageSquare, Zap, Settings, LogIn, Radio, Menu, X, BookUser, History, Server, Check, Users, Mail, MessageCircle, Plus, Trash2, Wallet, Smartphone, ExternalLink, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useGetBotStatus } from "@workspace/api-client-react";
import { setBaseUrl } from "@workspace/api-client-react";
import { apiGet } from "@/lib/api";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/login", label: "Telegram Accounts", icon: UserCog },
  { href: "/tg-campaign", label: "TG Campaign", icon: Send },
  { href: "/tg-scraper", label: "Group Scraper", icon: Users },
  { href: "/gmail", label: "Gmail", icon: Mail },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/campaign-history", label: "History", icon: History },
  { href: "/contact-lists", label: "Contact Lists", icon: BookUser },
  { href: "/sms-campaign", label: "SMS Campaign", icon: MessageSquare },
  { href: "/sms-flash", label: "SMS Flash", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

const externalApps = [
  { href: "/wallet-recovery/", label: "Wallet Recovery", icon: Wallet },
  { href: "/sms-dashboard/", label: "SMS Gateway", icon: Smartphone },
];

function readServers(): string[] {
  try { return JSON.parse(localStorage.getItem("mfg_api_servers") || "[]"); } catch { return []; }
}

function ServerUrlBar() {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");
  const [servers, setServers] = useState<string[]>(readServers);
  const [current, setCurrent] = useState(() => localStorage.getItem("mfg_api_base") || "");

  const switchTo = (url: string | null) => {
    if (url) {
      localStorage.setItem("mfg_api_base", url);
      setBaseUrl(url);
      setCurrent(url);
    } else {
      localStorage.removeItem("mfg_api_base");
      setBaseUrl(null);
      setCurrent("");
    }
  };

  const addServer = () => {
    const trimmed = val.trim().replace(/\/+$/, "");
    if (!trimmed) { setAdding(false); return; }
    const next = [...new Set([...servers, trimmed])];
    setServers(next);
    localStorage.setItem("mfg_api_servers", JSON.stringify(next));
    switchTo(trimmed);
    setVal("");
    setAdding(false);
  };

  const removeServer = (url: string) => {
    const next = servers.filter(s => s !== url);
    setServers(next);
    localStorage.setItem("mfg_api_servers", JSON.stringify(next));
    if (current === url) switchTo(null);
  };

  const label = current ? current.replace(/^https?:\/\//, "").slice(0, 24) : "Local server";

  return (
    <div className="px-2 py-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-left"
      >
        <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{label}</span>
        <Plus className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-45")} />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          <button
            onClick={() => switchTo(null)}
            className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-sidebar-accent transition-colors text-left",
              !current ? "text-foreground" : "text-muted-foreground")}
          >
            <span className="flex-1 truncate">Local server</span>
            {!current && <Check className="w-3 h-3 text-green-500 shrink-0" />}
          </button>
          {servers.map(s => (
            <div key={s} className="group flex items-center gap-1">
              <button
                onClick={() => switchTo(s)}
                className={cn("flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-sidebar-accent transition-colors text-left min-w-0",
                  current === s ? "text-foreground" : "text-muted-foreground")}
              >
                <span className="flex-1 truncate">{s.replace(/^https?:\/\//, "")}</span>
                {current === s && <Check className="w-3 h-3 text-green-500 shrink-0" />}
              </button>
              <button onClick={() => removeServer(s)} className="p-1 text-muted-foreground hover:text-red-500 shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {adding ? (
            <div className="flex gap-1 px-1 pt-1">
              <input
                autoFocus
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addServer(); if (e.key === "Escape") { setAdding(false); setVal(""); } }}
                placeholder="https://your-server.com"
                className="flex-1 text-xs bg-muted border border-border rounded px-2 py-1 text-foreground min-w-0 outline-none focus:border-primary"
              />
              <button onClick={addServer} className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 shrink-0">Add</button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-primary hover:bg-sidebar-accent transition-colors text-left"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" /> Add Server
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: status } = useGetBotStatus({ query: { refetchInterval: 5000 } });
  const { data: waStatus } = useQuery<any>({
    queryKey: ["whatsapp-status"],
    queryFn: () => apiGet("/whatsapp/status"),
    refetchInterval: 8000,
  });

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">MFG Bot</p>
            <p className="text-xs text-muted-foreground mt-0.5">by teddymfg</p>
          </div>
        </div>
        <button
          className="md:hidden text-muted-foreground hover:text-foreground transition-colors p-1"
          onClick={() => setOpen(false)}
          data-testid="button-close-sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Connection badges */}
      <div className="px-4 py-3 border-b border-sidebar-border space-y-2">
        {/* Telegram */}
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full shrink-0", status?.connected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
          <div className="min-w-0 flex-1">
            {status?.connected && status.me ? (
              <p className="text-xs font-medium text-foreground truncate">
                Telegram <span className="text-muted-foreground">· @{status.me.username || status.me.name}</span>
              </p>
            ) : (
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                Telegram <span className="text-muted-foreground">· off</span>
                <Link href="/login" onClick={() => setOpen(false)}>
                  <span className="text-primary hover:underline cursor-pointer">Login →</span>
                </Link>
              </p>
            )}
          </div>
        </div>
        {/* WhatsApp */}
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full shrink-0",
            waStatus?.connected ? "bg-green-500 animate-pulse" : waStatus?.connecting ? "bg-yellow-500 animate-pulse" : "bg-red-500")} />
          <div className="min-w-0 flex-1">
            {waStatus?.connected ? (
              <p className="text-xs font-medium text-foreground truncate">
                WhatsApp <span className="text-muted-foreground">· {waStatus.me?.name || "connected"}</span>
              </p>
            ) : (
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                WhatsApp <span className="text-muted-foreground">· {waStatus?.connecting ? "scan QR" : "off"}</span>
                <Link href="/whatsapp" onClick={() => setOpen(false)}>
                  <span className="text-primary hover:underline cursor-pointer">Connect →</span>
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>
            <div
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors",
                location === href
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </div>
          </Link>
        ))}

        {/* Other apps (separate web apps on the same domain) */}
        <div className="pt-3 mt-2 border-t border-sidebar-border">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Other Apps</p>
          {externalApps.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              data-testid={`app-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border">
        <ServerUrlBar />
        {!status?.connected && (
          <div className="px-2 pb-2">
            <Link href="/login" onClick={() => setOpen(false)}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-primary hover:bg-sidebar-accent cursor-pointer transition-colors">
                <LogIn className="w-4 h-4" />
                Login to Telegram
              </div>
            </Link>
          </div>
        )}
        <p className="text-xs text-muted-foreground pb-3 px-4">
          {status?.uptime !== undefined
            ? `Uptime: ${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`
            : ""}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setOpen(true)}
            data-testid="button-open-sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">MFG Bot</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full", status?.connected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
            <span className="text-xs text-muted-foreground">{status?.connected ? "Online" : "Offline"}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
