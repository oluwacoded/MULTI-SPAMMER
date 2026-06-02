import { useRef, useState, useMemo, useEffect } from "react";
import { ShieldCheck, WifiOff, Search, Loader2, KeyRound, Copy, Check, AlertTriangle, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { parseTemplate } from "@/lib/recovery";
import type { RecoveryMatch, WorkerOutbound, RecoveryRequest } from "@/lib/recovery";

const MAX_COMBOS = 5_000_000;

type Phase = "idle" | "running" | "done";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      data-testid="button-copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function MatchCard({ match, isTarget }: { match: RecoveryMatch; isTarget: boolean }) {
  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5" data-testid="card-match">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {isTarget && <Check className="h-4 w-4 text-emerald-500" />}
            {isTarget ? "Match found" : "Valid candidate"}
          </CardTitle>
          <CopyButton value={match.mnemonic} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-background p-3 font-mono text-sm leading-relaxed break-words" data-testid="text-mnemonic">
          {match.mnemonic}
        </div>
        <div className="space-y-1.5">
          {match.addresses.map((a) => {
            const matched = match.matchedAddress?.path === a.path;
            return (
              <div
                key={a.path}
                className={`flex flex-col gap-0.5 rounded-md border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${matched ? "border-emerald-500/50 bg-emerald-500/10" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-muted-foreground">{a.path}</span>
                </div>
                <span className="font-mono break-all">{a.address}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { toast } = useToast();
  const workerRef = useRef<Worker | null>(null);

  const [template, setTemplate] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [addressIndexCount, setAddressIndexCount] = useState(5);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tested, setTested] = useState(0);
  const [total, setTotal] = useState(0);
  const [validChecksums, setValidChecksums] = useState(0);
  const [matches, setMatches] = useState<RecoveryMatch[]>([]);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const parsed = useMemo(() => parseTemplate(template), [template]);

  const unknownCount = parsed.slots.filter((s) => s.kind === "unknown").length;
  const choiceCount = parsed.slots.filter((s) => s.kind === "choices").length;
  const tooLarge = parsed.totalCombos > MAX_COMBOS;
  const hasInput = parsed.wordCount > 0;
  const canRun =
    hasInput &&
    parsed.errors.length === 0 &&
    !tooLarge &&
    (unknownCount > 0 || choiceCount > 0 || true);

  const stop = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setPhase("done");
  };

  const run = () => {
    if (!canRun) return;
    workerRef.current?.terminate();

    setPhase("running");
    setTested(0);
    setTotal(parsed.totalCombos);
    setValidChecksums(0);
    setMatches([]);
    setCapped(false);

    const worker = new Worker(new URL("../worker/recovery.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setTested(msg.tested);
        setValidChecksums(msg.validChecksums);
      } else if (msg.type === "done") {
        setTested(msg.tested);
        setValidChecksums(msg.validChecksums);
        setMatches(msg.matches);
        setCapped(msg.capped);
        setPhase("done");
        worker.terminate();
        workerRef.current = null;
        if (targetAddress.trim() && msg.matches.length === 0) {
          toast({
            title: "No match found",
            description: "None of the candidate phrases produced that address. Try widening your options.",
          });
        }
      } else if (msg.type === "error") {
        setPhase("done");
        worker.terminate();
        workerRef.current = null;
        toast({ title: "Recovery error", description: msg.message, variant: "destructive" });
      }
    };

    const request: RecoveryRequest = {
      candidatesPerSlot: parsed.slots.map((s) => s.candidates),
      passphrase,
      targetAddress: targetAddress.trim() ? targetAddress.trim() : null,
      addressIndexCount,
      maxCombos: MAX_COMBOS,
    };
    worker.postMessage(request);
  };

  const progressPct = total > 0 ? Math.min(100, (tested / total) * 100) : 0;
  const targetMatch = matches.find((m) => m.matchedAddress);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Seed Phrase Recovery</h1>
              <p className="text-sm text-muted-foreground">Recover your own BIP39 wallet</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <WifiOff className="h-3.5 w-3.5" /> Runs 100% offline in your browser
            </Badge>
            <Badge variant="secondary" className="gap-1.5 font-normal">
              <ShieldCheck className="h-3.5 w-3.5" /> Nothing is ever sent to a server
            </Badge>
          </div>
        </header>

        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium">Use this only for a wallet you own.</p>
              <p className="text-muted-foreground">
                Everything runs locally on this device. Your words and addresses never leave the browser — there is no
                backend. For maximum safety, disconnect from the internet before entering your phrase.
              </p>
            </div>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Your partial phrase</CardTitle>
            <CardDescription>
              Type the words you remember in order. For an unknown word use{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">?</code>. For a few possibilities use{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{open, oppose, option}"}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="legal winner thank year wave sausage worth useful legal winner thank ?"
              className="min-h-28 font-mono text-sm"
              spellCheck={false}
              data-testid="input-template"
            />

            {hasInput && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span data-testid="text-wordcount">{parsed.wordCount} words</span>
                {unknownCount > 0 && <span>{unknownCount} fully unknown</span>}
                {choiceCount > 0 && <span>{choiceCount} with options</span>}
                <span>
                  {formatNumber(parsed.totalCombos)} combination{parsed.totalCombos === 1 ? "" : "s"} to test
                </span>
              </div>
            )}

            {parsed.errors.length > 0 && (
              <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" data-testid="text-errors">
                {parsed.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}

            {tooLarge && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                That's {formatNumber(parsed.totalCombos)} combinations — too many to search quickly. Narrow it down (more
                known words, or fewer fully-unknown <code>?</code> slots). The limit is {formatNumber(MAX_COMBOS)}.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="target" className="text-sm">
                  Known address <span className="text-muted-foreground">(strongly recommended)</span>
                </Label>
                <Input
                  id="target"
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  placeholder="0x… or bc1… or 1…"
                  className="font-mono text-sm"
                  spellCheck={false}
                  data-testid="input-target"
                />
                <p className="text-xs text-muted-foreground">
                  An address you know belongs to this wallet. Lets us pinpoint the exact phrase.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passphrase" className="text-sm">
                  BIP39 passphrase <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Leave blank if you never set one"
                  className="font-mono text-sm"
                  spellCheck={false}
                  data-testid="input-passphrase"
                />
                <p className="text-xs text-muted-foreground">
                  The extra word ("25th word") some wallets add. Most people don't have one.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="indexcount" className="text-sm whitespace-nowrap">
                  Addresses per path
                </Label>
                <Input
                  id="indexcount"
                  type="number"
                  min={1}
                  max={20}
                  value={addressIndexCount}
                  onChange={(e) =>
                    setAddressIndexCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                  }
                  className="w-20"
                  data-testid="input-indexcount"
                />
              </div>
              {phase === "running" ? (
                <Button onClick={stop} variant="destructive" data-testid="button-stop">
                  Stop
                </Button>
              ) : (
                <Button onClick={run} disabled={!canRun} className="gap-2" data-testid="button-run">
                  <Search className="h-4 w-4" /> Start recovery
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {(phase === "running" || phase === "done") && (
          <Card className="mb-6">
            <CardContent className="space-y-3 pt-6">
              {phase === "running" && (
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              )}
              <Progress value={progressPct} data-testid="progress-search" />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span data-testid="text-tested">
                  {formatNumber(tested)} / {formatNumber(total)} tested
                </span>
                <span>{formatNumber(validChecksums)} valid checksums</span>
                {phase === "done" && (
                  <span data-testid="text-matchcount">
                    {matches.length} {targetAddress.trim() ? "match" : "candidate"}
                    {matches.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {capped && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Results were capped. Add the known address or narrow your options to find the exact phrase.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {phase === "done" && matches.length > 0 && (
          <div className="mb-6 space-y-3">
            {targetMatch ? (
              <MatchCard match={targetMatch} isTarget />
            ) : (
              <>
                {!targetAddress.trim() && (
                  <p className="text-sm text-muted-foreground">
                    These phrases all have valid checksums. Add a known address above to identify which one is yours.
                  </p>
                )}
                {matches.slice(0, 50).map((m, i) => (
                  <MatchCard key={i} match={m} isTarget={false} />
                ))}
              </>
            )}
          </div>
        )}

        {phase === "done" && matches.length === 0 && (
          <Card className="mb-6 border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CircleHelp className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No valid phrase found</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                None of the {formatNumber(tested)} combinations matched. Double-check the order of the words you do
                remember, and widen the options for any you're unsure about.
              </p>
            </CardContent>
          </Card>
        )}

        <Accordion type="single" collapsible className="rounded-lg border px-4">
          <AccordionItem value="how" className="border-none">
            <AccordionTrigger className="text-sm">How does this work?</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                A BIP39 seed phrase has a built-in checksum, so only specific word combinations are valid. This tool
                tries every combination you describe, keeps the ones with a valid checksum, derives the standard wallet
                addresses (Ethereum, Bitcoin Legacy and SegWit) for each, and compares them against an address you know.
              </p>
              <p>
                All computation happens inside your browser using audited libraries (@scure / @noble). No words,
                addresses, or results are transmitted anywhere — you can verify this by turning off your network.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
