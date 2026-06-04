import React from "react";
import { Link, useLocation } from "wouter";
import { useGetSmmWallet } from "@workspace/api-client-react";
import { LayoutDashboard, ShoppingCart, Activity, Wallet, Layers } from "lucide-react";
import { formatMoney } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: balanceData, isLoading } = useGetSmmWallet();

  const navItems = [
    { label: "Catalog", path: "/", icon: LayoutDashboard },
    { label: "New Order", path: "/order", icon: ShoppingCart },
    { label: "Order Status", path: "/status", icon: Activity },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary">
            <Layers className="h-6 w-6" />
            <span>MFG SMM</span>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border bg-background/50">
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Wallet className="h-3 w-3" />
              Available Balance
            </div>
            {isLoading ? (
              <div className="h-8 w-24 bg-secondary rounded animate-pulse mt-1"></div>
            ) : (
              <div className="text-2xl font-bold tracking-tight mt-1" data-testid="display-balance">
                {formatMoney(balanceData?.balance, balanceData?.currency)}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden h-16 border-b border-border flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-2 font-bold text-lg text-primary">
            <Layers className="h-5 w-5" />
            MFG SMM
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span>{formatMoney(balanceData?.balance ?? 0, balanceData?.currency)}</span>
          </div>
        </header>

        {/* Mobile Nav */}
        <nav className="md:hidden flex overflow-x-auto border-b border-border bg-card/50 hide-scrollbar">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex-1 whitespace-nowrap px-4 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                  isActive 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
