import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/api";
import { MailCheck, Copy, Download, CheckCircle2, XCircle } from "lucide-react";

type EmailResult = {
  email: string;
  valid: boolean;
  status: string;
  reason: string;
};

const STATUS_STYLE: Record<string, string> = {
  valid: "bg-green-500/15 text-green-500 border-green-500/30",
  invalid_format: "bg-red-500/15 text-red-500 border-red-500/30",
  disposable: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  no_mail_server: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  domain_not_found: "bg-red-500/15 text-red-500 border-red-500/30",
};

export default function EmailVerifier() {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [data, setData] = useState<any | null>(null);

  const verify = useMutation({
    mutationFn: async () => apiPost("/tools/verify-emails", { emails: input }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: "Couldn't verify", description: res.message, variant: "destructive" });
        return;
      }
      setData(res);
      toast({ title: "Done", description: `${res.validCount} valid of ${res.total}` });
    },
    onError: () => toast({ title: "Network error", variant: "destructive" }),
  });

  const validEmails: string[] = data?.validEmails || [];

  const copyValid = () => {
    navigator.clipboard.writeText(validEmails.join("\n"));
    toast({ title: `Copied ${validEmails.length} valid emails` });
  };

  const downloadCsv = () => {
    const rows = ["email,status,reason"];
    for (const r of (data?.results || []) as EmailResult[]) {
      rows.push(`"${r.email}","${r.status}","${r.reason}"`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "email-verification.csv";
    a.click();
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MailCheck className="w-6 h-6" /> Email Verifier
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Check that emails are real before you send — catches typos, dead domains and throwaway
            addresses to cut bounces and protect your sender reputation.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paste emails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"one per line or separated by commas\njohn@gmail.com\njane@company.com"}
              className="min-h-[140px] font-mono text-sm"
            />
            <Button
              className="w-full"
              onClick={() => verify.mutate()}
              disabled={!input.trim() || verify.isPending}
            >
              {verify.isPending ? "Verifying…" : "Verify emails"}
            </Button>
          </CardContent>
        </Card>

        {data && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Results
                  <Badge variant="outline" className="text-green-500 border-green-500/30">
                    {data.validCount} valid
                  </Badge>
                  <Badge variant="outline" className="text-red-500 border-red-500/30">
                    {data.invalidCount} bad
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyValid} disabled={!validEmails.length}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy valid
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadCsv}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto space-y-1">
                {(data.results as EmailResult[]).map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/30"
                  >
                    {r.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="text-sm font-mono text-foreground truncate flex-1">{r.email}</span>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLE[r.status] || "text-muted-foreground"}
                    >
                      {r.reason}
                    </Badge>
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
