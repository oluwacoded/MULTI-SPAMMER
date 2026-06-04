import React, { useState, useMemo } from "react";
import { useGetSmmWallet, useInitiateSmmDeposit } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";
import { Wallet, ArrowUpRight, ArrowDownRight, Loader2, Receipt, CreditCard, TrendingUp, ShoppingCart, RotateCcw } from "lucide-react";
import type { SmmWalletTransaction } from "@workspace/api-client-react";

type FilterType = "all" | "deposit" | "order" | "refund";

const FILTER_LABELS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: null },
  { key: "deposit", label: "Deposits", icon: <TrendingUp className="h-3 w-3" /> },
  { key: "order", label: "Orders", icon: <ShoppingCart className="h-3 w-3" /> },
  { key: "refund", label: "Refunds", icon: <RotateCcw className="h-3 w-3" /> },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function txColor(type: string) {
  if (type === "deposit" || type === "refund") return "text-emerald-500";
  return "text-red-500";
}

export default function WalletPage() {
  const { data: walletData, isLoading, refetch } = useGetSmmWallet();
  const deposit = useInitiateSmmDeposit();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const handleDeposit = async () => {
    const num = Number(amount);
    if (!num || num < 100) {
      toast({ title: "Minimum deposit is ₦100", variant: "destructive" });
      return;
    }
    try {
      const result = await deposit.mutateAsync({
        data: { amount: num, redirectUrl: `${window.location.origin}/wallet` },
      });
      if (result.link) {
        window.location.href = result.link;
      } else {
        toast({ title: "Could not initiate deposit", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: err?.data?.error || "Deposit failed", variant: "destructive" });
    }
  };

  const handleVerify = () => {
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get("tx_ref");
    const transactionId = params.get("transaction_id");
    if (txRef && transactionId) {
      window.location.href = `/api/smm/deposit/verify?tx_ref=${txRef}&transaction_id=${transactionId}`;
    } else {
      toast({ title: "No transaction to verify", variant: "destructive" });
    }
  };

  const allTxns = walletData?.transactions ?? [];

  const summary = useMemo(() => {
    const totalDeposited = allTxns
      .filter((t) => t.type === "deposit" && t.status === "success")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const totalSpent = allTxns
      .filter((t) => t.type === "order" && t.status === "success")
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const totalRefunded = allTxns
      .filter((t) => t.type === "refund")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return { totalDeposited, totalSpent, totalRefunded };
  }, [allTxns]);

  const filtered = useMemo(
    () => (filter === "all" ? allTxns : allTxns.filter((t) => t.type === filter)),
    [allTxns, filter],
  );

  const currency = walletData?.currency;

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="text-muted-foreground mt-1">Manage your balance and top up your account.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" />
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-40" />
            ) : (
              <div className="text-4xl font-bold tracking-tight">
                {formatMoney(walletData?.balance, currency)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              Top Up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount (₦)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="100"
              />
              <Button onClick={handleDeposit} disabled={deposit.isPending}>
                {deposit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deposit"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Minimum deposit: ₦100. Payments are processed via Flutterwave.</p>
            <Button variant="outline" onClick={handleVerify} className="w-full">
              Verify Pending Payment
            </Button>
          </CardContent>
        </Card>
      </div>

      {!isLoading && allTxns.length > 0 && (
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Total Deposited
              </p>
              <p className="text-xl font-bold text-emerald-500">
                {formatMoney(String(summary.totalDeposited), currency)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <ShoppingCart className="h-3 w-3 text-red-500" /> Total Spent
              </p>
              <p className="text-xl font-bold text-red-500">
                {formatMoney(String(summary.totalSpent), currency)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <RotateCcw className="h-3 w-3 text-blue-500" /> Total Refunded
              </p>
              <p className="text-xl font-bold text-blue-500">
                {formatMoney(String(summary.totalRefunded), currency)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Transaction History
            </CardTitle>
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              {FILTER_LABELS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {icon}
                  {label}
                  {key !== "all" && (
                    <span className="ml-1 text-[10px] opacity-60">
                      ({allTxns.filter((t) => t.type === key).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !filtered.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {filter === "all" ? "No transactions yet." : `No ${filter} transactions yet.`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Balance After</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Reference</th>
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium whitespace-nowrap">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((tx: SmmWalletTransaction) => {
                    const isCredit = tx.type === "deposit" || tx.type === "refund";
                    return (
                      <tr key={tx.id} className="hover:bg-secondary/30">
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            {isCredit ? (
                              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 text-red-500" />
                            )}
                            <span className="capitalize">{tx.type}</span>
                          </div>
                        </td>
                        <td className={`py-3 font-mono font-medium ${txColor(tx.type)}`}>
                          {isCredit ? "+" : ""}{formatMoney(tx.amount, currency)}
                        </td>
                        <td className="py-3 font-mono text-muted-foreground">
                          {formatMoney(tx.balanceAfter, currency)}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              tx.status === "success"
                                ? "default"
                                : tx.status === "pending"
                                ? "secondary"
                                : "destructive"
                            }
                            className="text-xs capitalize"
                          >
                            {tx.status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {tx.reference ? (
                            <span className="font-mono text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                              {tx.reference}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground max-w-[200px] truncate">
                          {tx.description ?? "—"}
                        </td>
                        <td className="py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(tx.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
