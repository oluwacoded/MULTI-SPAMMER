import React, { useState } from "react";
import { Link } from "wouter";
import { useGetSmmOrders } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";
import { Package, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import type { SmmPanelOrder } from "@workspace/api-client-react";

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30", icon: <Clock className="h-4 w-4" /> },
  processing: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  completed: { color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30", icon: <CheckCircle2 className="h-4 w-4" /> },
  cancelled: { color: "bg-red-500/20 text-red-500 border-red-500/30", icon: <XCircle className="h-4 w-4" /> },
  refunded: { color: "bg-orange-500/20 text-orange-500 border-orange-500/30", icon: <AlertTriangle className="h-4 w-4" /> },
};

export default function OrdersPage() {
  const { data: ordersData, isLoading } = useGetSmmOrders();
  const [filter, setFilter] = useState("all");

  const orders = ordersData?.orders || [];
  const filtered = filter === "all" ? orders : orders.filter((o: SmmPanelOrder) => o.status === filter);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Orders</h1>
          <p className="text-muted-foreground mt-1">Track and manage your social media orders.</p>
        </div>
        <div className="flex gap-2">
          {["all", "pending", "processing", "completed", "cancelled"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Order History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {orders.length === 0
                ? "No orders yet. Browse the catalog and place your first order."
                : "No orders match this filter."}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((order: SmmPanelOrder) => {
                const cfg = statusConfig[order.status] || statusConfig.pending;
                return (
                  <Link
                    key={order.id}
                    href={`/status?id=${order.id}`}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors group"
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{order.serviceName}</span>
                        <Badge variant="outline" className="text-xs">#{order.id}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {order.quantity} × {order.link}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium text-sm">
                        {formatMoney(order.charge, "NGN")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
