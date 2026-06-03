import React, { useState } from "react";
import { useLocation } from "wouter";
import { useGetSmmOrderStatus, getGetSmmOrderStatusQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Clock, CheckCircle2, XCircle, Activity, AlertTriangle } from "lucide-react";

export default function Status() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialId = searchParams.get("id") || "";
  
  const [orderIdInput, setOrderIdInput] = useState(initialId);
  const [activeOrderId, setActiveOrderId] = useState(initialId);
  
  const [, setLocation] = useLocation();

  const { data: statusData, isLoading, isError, error } = useGetSmmOrderStatus(
    activeOrderId, 
    { query: { enabled: !!activeOrderId, queryKey: getGetSmmOrderStatusQueryKey(activeOrderId) } }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderIdInput.trim()) {
      setActiveOrderId(orderIdInput.trim());
      setLocation(`/status?id=${orderIdInput.trim()}`, { replace: true });
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status) return "bg-secondary text-secondary-foreground";
    const s = status.toLowerCase();
    if (s.includes("pending")) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    if (s.includes("progress")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (s.includes("complete")) return "bg-primary/20 text-primary border-primary/30";
    if (s.includes("partial")) return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    if (s.includes("cancel")) return "bg-destructive/20 text-destructive border-destructive/30";
    return "bg-secondary text-secondary-foreground border-border";
  };

  const getStatusIcon = (status?: string) => {
    if (!status) return <Activity className="h-5 w-5" />;
    const s = status.toLowerCase();
    if (s.includes("pending")) return <Clock className="h-5 w-5" />;
    if (s.includes("progress")) return <Loader2 className="h-5 w-5 animate-spin" />;
    if (s.includes("complete")) return <CheckCircle2 className="h-5 w-5" />;
    if (s.includes("cancel")) return <XCircle className="h-5 w-5" />;
    return <Activity className="h-5 w-5" />;
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Order Tracking</h1>
        <p className="text-muted-foreground mt-2">Enter your Order ID to check current status.</p>
      </div>

      <Card className="bg-card border-border shadow-md mb-8">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input 
              placeholder="e.g. 12345678" 
              className="bg-secondary/50 border-border h-12 text-lg font-mono text-center tracking-widest"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
              data-testid="input-order-id"
            />
            <Button type="submit" className="h-12 px-8 font-bold" disabled={!orderIdInput.trim()} data-testid="btn-search-status">
              <Search className="h-5 w-5 mr-2" />
              Track
            </Button>
          </form>
        </CardContent>
      </Card>

      {activeOrderId && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {isLoading ? (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                <p>Retrieving order data from provider...</p>
              </CardContent>
            </Card>
          ) : isError ? (
            <Card className="bg-destructive/5 border-destructive/20">
              <CardContent className="py-10 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-bold text-destructive mb-1">Order Not Found</h3>
                <p className="text-muted-foreground text-sm">
                  {error?.message || "Could not retrieve status for this ID. Please verify it is correct."}
                </p>
              </CardContent>
            </Card>
          ) : statusData ? (
            <Card className="bg-card border-border overflow-hidden">
              <div className="bg-secondary/30 p-6 flex flex-col sm:flex-row justify-between items-center border-b border-border gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Order ID</p>
                  <p className="text-2xl font-mono tracking-tight font-bold">#{statusData.orderId}</p>
                </div>
                <Badge variant="outline" className={`px-4 py-2 text-sm font-bold border flex items-center gap-2 ${getStatusColor(statusData.status)}`}>
                  {getStatusIcon(statusData.status)}
                  {statusData.status.toUpperCase()}
                </Badge>
              </div>
              <CardContent className="p-0">
                <div className="grid grid-cols-2 divide-x divide-y sm:divide-y-0 divide-border bg-card">
                  <div className="p-6">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Charge</p>
                    <p className="text-xl font-bold tracking-tight">
                      {statusData.charge ? `$${parseFloat(statusData.charge).toFixed(3)}` : "—"}
                    </p>
                  </div>
                  <div className="p-6">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Start Count</p>
                    <p className="text-xl font-bold tracking-tight font-mono">
                      {statusData.startCount || "—"}
                    </p>
                  </div>
                  <div className="p-6 col-span-2 sm:col-span-2 border-t border-border bg-secondary/10">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Remains</p>
                    <p className="text-xl font-bold tracking-tight font-mono">
                      {statusData.remains || "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
