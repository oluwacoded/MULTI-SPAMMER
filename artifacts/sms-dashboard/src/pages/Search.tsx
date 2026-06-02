import { useState } from "react";
import { useSearch } from "@/lib/hooks";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Search as SearchIcon, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export default function Search() {
  const [q, setQ] = useState("");
  const { data: results, isLoading, isFetched } = useSearch(q);

  return (
    <div className="p-8 space-y-6 overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search</h1>
        <p className="text-muted-foreground mt-1">Find any message across all conversations.</p>
      </div>

      <div className="relative max-w-xl">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search message text..."
          className="pl-9"
          autoFocus
        />
      </div>

      {isLoading && q.trim() && (
        <div className="text-sm text-muted-foreground">Searching...</div>
      )}

      {!q.trim() && (
        <div className="py-16 text-center text-muted-foreground">
          <SearchIcon className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm">Type above to search your message history.</p>
        </div>
      )}

      {q.trim() && isFetched && results?.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No messages match "{q}".
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3 max-w-3xl">
          <div className="text-sm text-muted-foreground">{results.length} result(s)</div>
          {results.map((r) => {
            const isInbound = r.direction === "inbound";
            return (
              <Link key={r.id} href="/conversations">
                <Card className="p-4 hover:bg-muted/40 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {isInbound ? (
                        <ArrowDownLeft className="h-4 w-4 text-primary" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-mono">{r.peerPhone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(r.createdAt), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/90">{r.body}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
