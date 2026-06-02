import { useRef, useState, useMemo, useEffect } from "react";
import { ShieldCheck, WifiOff, Search, Loader2, KeyRound, Copy, Check, AlertTriangle, CircleHelp, Radar, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { parseTemplate } from "@/lib/recovery";
import type { RecoveryMatch, WorkerOutbound, RecoveryRequest, LogLevel } from "@/lib/recovery";

const MAX_COMBOS = 5_000_000;
const MAX_LOG_LINES = 250;

type Phase = "idle" | "running" | "done";

interface LogLine {
  level: LogLevel;
  line: string;
}

function TerminalPanel({ lines, running }: { lines: LogLine[]; running: boolean }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const color: Record<LogLevel, string> = {
    info: "text-emerald-300/70",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    hit: "text-emerald-300 font-semibold",
  };

  return (
    <div
      className="h-56 overflow-y-auto rounded-md border border-emerald-500/20 bg-black p-3 font-mono text-xs leading-relaxed"
      data-testid="terminal-log"
    >
      <div className="mb-1 text-emerald-500/50">recovery@local:~$ start_search</div>
      {lines.map((l, i) => (
        <div key={i} className={color[l.level]}>
          <span className="text-emerald-500/40">{">"}</span> {l.line}
        </div>
      ))}
      {running && (
        <div className="text-emerald-400">
          <span className="text-emerald-500/40">{">"}</span>{" "}
          <span className="inline-block h-3 w-2 animate-pulse bg-emerald-400 align-middle" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

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
            {match.activity ? "Wallet with funds found" : isTarget ? "Match found" : "Valid candidate"}
          </CardTitle>
          <CopyButton value={match.mnemonic} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {match.activity && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs" data-testid="text-activity">
            <Wallet className="h-3.5 w-3.5 text-emerald-500" />
            <span>
              <span className="font-medium">{match.activity.chain}</span> · {match.activity.balance} ·{" "}
              {match.activity.txCount} transaction{match.activity.txCount === 1 ? "" : "s"}
            </span>
          </div>
        )}
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
  const [scanOnChain, setScanOnChain] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tested, setTested] = useState(0);
  const [total, setTotal] = useState(0);
  const [validChecksums, setValidChecksums] = useState(0);
  const [checked, setChecked] = useState(0);
  const [matches, setMatches] = useState<RecoveryMatch[]>([]);
  const [validPhrases, setValidPhrases] = useState<RecoveryMatch[]>([]);
  const [stopped, setStopped] = useState(false);
  const [capped, setCapped] = useState(false);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [runWithScan, setRunWithScan] = useState(false);
  const [runWithTarget, setRunWithTarget] = useState(false);

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
    setStopped(true);
    setPhase("done");
  };

  const run = () => {
    if (!canRun) return;
    workerRef.current?.terminate();

    setPhase("running");
    setTested(0);
    setTotal(parsed.totalCombos);
    setValidChecksums(0);
    setChecked(0);
    setMatches([]);
    setValidPhrases([]);
    setStopped(false);
    setCapped(false);
    setLogLines([]);

    const worker = new Worker(new URL("../worker/recovery.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setTested(msg.tested);
        setValidChecksums(msg.validChecksums);
        setChecked(msg.checked);
      } else if (msg.type === "valid") {
        setValidPhrases((prev) => (prev.length >= 200 ? prev : [...prev, msg.match]));
      } else if (msg.type === "log") {
        setLogLines((prev) => {
          const next = [...prev, { level: msg.level, line: msg.line }];
          return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
        });
      } else if (msg.type === "done") {
        setTested(msg.tested);
        setValidChecksums(msg.validChecksums);
        setMatches(msg.matches);
        setCapped(msg.capped);
        setPhase("done");
        worker.terminate();
        workerRef.current = null;
        if ((runWithTarget || runWithScan) && msg.matches.length === 0) {
          toast({
            title: "No match found",
            description: runWithScan
              ? "No on-chain activity found for any valid phrase. Try widening your options or more addresses per path."
              : "None of the candidate phrases produced that address. Try widening your options.",
          });
        }
      } else if (msg.type === "error") {
        setPhase("done");
        worker.terminate();
        workerRef.current = null;
        toast({ title: "Recovery error", description: msg.message, variant: "destructive" });
      }
    };

    const useScan = scanOnChain && !targetAddress.trim();
    setRunWithScan(useScan);
    setRunWithTarget(!!targetAddress.trim());
    const request: RecoveryRequest = {
      candidatesPerSlot: parsed.slots.map((s) => s.candidates),
      passphrase,
      targetAddress: targetAddress.trim() ? targetAddress.trim() : null,
      addressIndexCount,
      maxCombos: MAX_COMBOS,
      scanOnChain: useScan,
    };
    worker.postMessage(request);
  };

  const progressPct = total > 0 ? Math.min(100, (tested / total) * 100) : 0;
  const targetMatch = matches.find((m) => m.matchedAddress);
  const scanActive = scanOnChain && !targetAddress.trim();

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
              <ShieldCheck className="h-3.5 w-3.5" /> Your seed phrase never leaves this device
            </Badge>
            {scanActive ? (
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <Radar className="h-3.5 w-3.5" /> On-chain scan on — only public addresses go online
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <WifiOff className="h-3.5 w-3.5" /> Runs 100% offline in your browser
              </Badge>
            )}
          </div>
        </header>

        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium">Use this only for a wallet you own.</p>
              <p className="text-muted-foreground">
                Your seed phrase is computed locally and never leaves this device — there is no backend.{" "}
                {scanActive
                  ? "Because the on-chain scan is on, your public addresses (never your seed) are sent to public block explorers to check for funds."
                  : "Nothing is sent anywhere. For maximum safety, disconnect from the internet before entering your phrase."}
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

            {hasInput && parsed.errors.length === 0 && parsed.totalCombos === 1 && (
              <div className="flex gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs" data-testid="hint-single-combo">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-muted-foreground">
                  Every word is set, so this tests only <span className="font-medium text-foreground">one exact guess</span>.
                  If it doesn't match, you remembered a word or the order slightly wrong. Mark the ones you're unsure of
                  with <code className="rounded bg-muted px-1">?</code> (or a few options like{" "}
                  <code className="rounded bg-muted px-1">{"{rent, rend, lend}"}</code>) so the tool searches the
                  alternatives for you.
                </p>
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
                  An address you know belongs to this wallet. Lets us pinpoint the exact phrase. Don't know it? Leave it
                  blank and turn on the on-chain scan below.
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

            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-2.5">
                  <Radar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-0.5">
                    <Label htmlFor="scan" className="text-sm font-medium">
                      Find my wallet by on-chain activity
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Don't know your address? Keep scanning each valid phrase against public block explorers until one
                      shows a balance or transaction history.
                    </p>
                  </div>
                </div>
                <Switch
                  id="scan"
                  checked={scanOnChain}
                  onCheckedChange={setScanOnChain}
                  disabled={!!targetAddress.trim()}
                  data-testid="switch-scan"
                />
              </div>
              {scanOnChain && !targetAddress.trim() && (
                <div className="mt-3 flex gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <p className="text-muted-foreground">
                    This goes online. Only your <span className="font-medium text-foreground">public addresses</span>{" "}
                    are sent to public explorers (Blockstream, PublicNode) — exactly what any wallet app does to show a
                    balance. Your seed phrase still never leaves this device. It's slower, since each address is looked
                    up over the network.
                  </p>
                </div>
              )}
              {!!targetAddress.trim() && (
                <p className="mt-2 text-xs text-muted-foreground">
                  A known address is set, so the search stays fully offline and matches against it directly.
                </p>
              )}
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
                  <Loader2 className="h-4 w-4 animate-spin" />{" "}
                  {runWithScan ? "Searching & scanning chains…" : "Searching…"}
                </div>
              )}
              <Progress value={progressPct} data-testid="progress-search" />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span data-testid="text-tested">
                  {formatNumber(tested)} / {formatNumber(total)} tested
                </span>
                <span>{formatNumber(validChecksums)} valid checksums</span>
                {runWithScan && (
                  <span data-testid="text-checked">{formatNumber(checked)} addresses scanned</span>
                )}
                {phase === "done" && (
                  <span data-testid="text-matchcount">
                    {runWithTarget || runWithScan
                      ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
                      : `${formatNumber(validPhrases.length)} candidate${validPhrases.length === 1 ? "" : "s"}`}
                  </span>
                )}
              </div>
              <TerminalPanel lines={logLines} running={phase === "running"} />
              {capped && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Results were capped. Add the known address or narrow your options to find the exact phrase.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {phase === "done" && stopped && (matches.length > 0 || validPhrases.length > 0) && (
          <p className="mb-3 text-sm text-muted-foreground" data-testid="text-stopped">
            Search stopped — showing what was found so far.
          </p>
        )}

        {/* Confirmed hit — matched your address or had on-chain funds */}
        {phase === "done" && matches.length > 0 && (
          <div className="mb-6 space-y-3">
            {(targetMatch ? [targetMatch] : matches).map((m, i) => (
              <MatchCard key={i} match={m} isTarget />
            ))}
          </div>
        )}

        {/* Valid-checksum phrases found so far (streamed live, kept after Stop) */}
        {phase === "done" && matches.length === 0 && validPhrases.length > 0 && (
          <div className="mb-6 space-y-3" data-testid="list-valid-phrases">
            <p className="text-sm font-medium">
              {formatNumber(validPhrases.length)}
              {validChecksums > validPhrases.length ? "+" : ""} valid phrase
              {validPhrases.length === 1 ? "" : "s"} found
            </p>
            {runWithTarget || runWithScan ? (
              <p className="text-xs text-muted-foreground">
                These passed the checksum but did <span className="font-medium text-foreground">not</span> match your
                {runWithScan ? " on-chain activity" : " address"} — so none of these is your wallet. They're shown only so
                you can see the search is working.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                These all have valid checksums. Add a known address above — or turn on the on-chain scan — to identify
                which one is yours.
              </p>
            )}
            {validPhrases.slice(0, 50).map((m, i) => (
              <MatchCard key={i} match={m} isTarget={false} />
            ))}
            {validPhrases.length > 50 && (
              <p className="text-xs text-muted-foreground">
                Showing the first 50 of {formatNumber(validPhrases.length)}.
              </p>
            )}
          </div>
        )}

        {/* Nothing valid found */}
        {phase === "done" && matches.length === 0 && validPhrases.length === 0 && (
          <Card className="mb-6 border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CircleHelp className="h-8 w-8 text-muted-foreground" />
              {stopped ? (
                <>
                  <p className="text-sm font-medium">Stopped before any valid phrase was found</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    No valid-checksum phrase had turned up yet in the {formatNumber(tested)} combination
                    {tested === 1 ? "" : "s"} tested so far. Let it run longer, or widen the options for words you're
                    unsure about.
                  </p>
                </>
              ) : validChecksums === 0 ? (
                <>
                  <p className="text-sm font-medium">Those exact words aren't a valid seed phrase</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    A real seed phrase has a built-in checksum, so the words and their order have to be exactly right.
                    {tested === 1
                      ? " You gave one fixed guess and it didn't pass — which almost always means a word is slightly off or out of order."
                      : ` None of the ${formatNumber(tested)} combinations passed the checksum.`}
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Tell the tool which words you're unsure about so it can try the alternatives for you: replace any
                    uncertain word with <code className="rounded bg-muted px-1">?</code>, or list a few options like{" "}
                    <code className="rounded bg-muted px-1">{"{rent, rend, lend}"}</code>. Then run it again.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No matching wallet found</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {formatNumber(validChecksums)} valid phrase{validChecksums === 1 ? "" : "s"} were checked, but none
                    matched your address{runWithScan ? " or showed any on-chain activity" : ""}. Double-check the known
                    address, widen the options for any words you're unsure about, or increase "Addresses per path".
                  </p>
                </>
              )}
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
                <span className="font-medium text-foreground">If you don't know your address:</span> turn on the on-chain
                scan. The tool keeps deriving addresses from each valid phrase and checks public block explorers until it
                finds one with a balance or transaction history — that's your wallet.
              </p>
              <p>
                <span className="font-medium text-foreground">Your recovered phrase is shown right here on screen</span>{" "}
                with a copy button — it is never emailed, sent, or stored anywhere. The seed computation happens entirely
                in your browser using audited libraries (@scure / @noble). The optional on-chain scan only ever sends
                public addresses, never your seed.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
