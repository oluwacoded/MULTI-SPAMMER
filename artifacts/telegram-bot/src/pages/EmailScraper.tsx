import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { Globe, Copy, Download, Mail } from "lucide-react";

type SiteResult = { site: string; emails: string[]; error: string | null };

export default function EmailScraper() {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [data, setData] = useState<any | null>(null);

  const scrape = useMutation({
    mutationFn: async () => apiPost("/tools/scrape-emails", { urls: input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: "Couldn't scrape", description: res.message, variant: "destructive" });
        return;
      }
      setData(res);
      toast({ title: "Done", description: `${res.emailCount} emails from ${res.sites} sites` });
    },
    onError: () => toast({ title: "Network error", variant: "destructive" }),
  });

  const allEmails: string[] = data?.allEmails || [];

  const copyAll = () => {
    navigator.clipboard.writeText(allEmails.join("\n"));
    toast({ title: `Copied ${allEmails.length} emails` });
  };

  const downloadCsv = () => {
    const rows = ["email,site"];
    for (const r of (data?.results || []) as SiteResult[]) {
      for (const e of r.emails) rows.push(`"${e}","${r.site}"`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scraped-emails.csv";
    a.click();
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="w-6 h-6" /> Website Email Scraper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste website addresses and pull any public email addresses from their pages (homepage,
            contact and about pages). Run results through the Email Verifier before sending.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paste websites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"one per line or separated by commas\nexample.com\nhttps://acme.io"}
              className="min-h-[140px] font-mono text-sm"
            />
            <Button
              className="w-full"
              onClick={() => scrape.mutate()}
              disabled={!input.trim() || scrape.isPending}
            >
              {scrape.isPending ? "Scraping…" : "Scrape emails"}
            </Button>
          </CardContent>
        </Card>

        {data && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Found
                  <Badge variant="outline" className="text-green-500 border-green-500/30">
                    {data.emailCount} emails
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyAll} disabled={!allEmails.length}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy all
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!allEmails.length}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(data.results as SiteResult[]).map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate flex-1">{r.site}</span>
                      <Badge variant="outline" className="text-muted-foreground">
                        {r.emails.length}
                      </Badge>
                    </div>
                    {r.emails.length > 0 ? (
                      <div className="space-y-0.5 pl-5">
                        {r.emails.map((e, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-mono text-foreground truncate">{e}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground pl-5">{r.error || "No emails found"}</p>
                    )}
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
