import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Send, MessageSquare, Zap, Settings, LogIn, Radio, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetBotStatus } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tg-campaign", label: "TG Campaign", icon: Send },
  { href: "/sms-campaign", label: "SMS Campaign", icon: MessageSquare },
  { href: "/sms-flash", label: "SMS Flash", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: status } = useGetBotStatus({ query: { refetchInterval: 5000 } });

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
        {/* Close button on mobile */}
        <button
          className="md:hidden text-muted-foreground hover:text-foreground transition-colors p-1"
          onClick={() => setOpen(false)}
          data-testid="button-close-sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Connection badge */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full shrink-0", status?.connected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
          <div className="min-w-0">
            {status?.connected && status.me ? (
              <>
                <p className="text-xs font-medium text-foreground truncate">@{status.me.username || status.me.name}</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-foreground">Not connected</p>
                <Link href="/login" onClick={() => setOpen(false)}>
                  <span className="text-xs text-primary hover:underline cursor-pointer">Login →</span>
                </Link>
              </>
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
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        {!status?.connected && (
          <Link href="/login" onClick={() => setOpen(false)}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-primary hover:bg-sidebar-accent cursor-pointer transition-colors">
              <LogIn className="w-4 h-4" />
              Login to Telegram
            </div>
          </Link>
        )}
        <p className="text-xs text-muted-foreground mt-2 px-1">
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
