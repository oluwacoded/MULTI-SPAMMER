import React, { useState } from "react";
import { useGetSmmWallet, useInitiateSmmDeposit, useVerifySmmDeposit } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";
import { Wallet, ArrowUpRight, ArrowDownRight, Loader2, Receipt, CreditCard } from "lucide-react";
import type { SmmWalletTransaction } from "@workspace/api-client-react";

export default function WalletPage() {
  const { data: walletData, isLoading, refetch } = useGetSmmWallet();
  const deposit = useInitiateSmmDeposit();
  const verify = useVerifySmmDeposit();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");

  const handleDeposit = async () => {
    const num = Number(amount);
    if (!num || num < 100) {
      toast({ title: "Minimum deposit is ₦100", variant: "destructive" });
      return;
    }
    try {
      const result = await deposit.mutateAsync({
        data: { amount: num, redirectUrl: `${window.location.origin}/wallet`, currency: "NGN" },
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

  const handleVerify = async () => {
    const params = new URLSearchParams(window.location.search);
    const txRef = params.get("tx_ref");
    const transactionId = params.get("transaction_id");
    if (!transactionId && !txRef) {
      toast({ title: "No transaction to verify", variant: "destructive" });
      return;
    }
    try {
      const result = await verify.mutateAsync({
        data: { txRef: txRef || "", transactionId: transactionId || "" },
      });
      toast({ title: `Payment ${result.status}`, description: `Balance: ${result.balance}` });
      refetch();
    } catch (err: any) {
      toast({ title: err?.data?.error || "Verification failed", variant: "destructive" });
    }
  };

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
                {formatMoney(walletData?.balance, walletData?.currency)}
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
            <Button variant="outline" onClick={handleVerify} disabled={verify.isPending} className="w-full">
              {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Pending Payment"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !walletData?.transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No transactions yet.
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
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {walletData.transactions.map((tx: SmmWalletTransaction) => (
                    <tr key={tx.id} className="hover:bg-secondary/30">
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {Number(tx.amount) >= 0 ? (
                            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 text-red-500" />
                          )}
                          <span className="capitalize">{tx.type}</span>
                        </div>
                      </td>
                      <td className="py-3 font-mono">
                        {formatMoney(tx.amount, walletData?.currency)}
                      </td>
                      <td className="py-3 font-mono">
                        {formatMoney(tx.balanceAfter, walletData?.currency)}
                      </td>
                      <td className="py-3">
                        <Badge variant={tx.status === "success" ? "default" : "secondary"} className="text-xs capitalize">
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground max-w-xs truncate">{tx.description}</td>
                      <td className="py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
