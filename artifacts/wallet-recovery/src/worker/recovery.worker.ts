import { deriveAddresses, isValidMnemonic, normalizeAddress } from "../lib/wallet";
import { checkActivity } from "../lib/balance";
import type {
  RecoveryRequest,
  RecoveryMatch,
  WorkerOutbound,
  LogLevel,
} from "../lib/recovery";

const post = (msg: WorkerOutbound) => {
  (self as unknown as Worker).postMessage(msg);
};

const log = (level: LogLevel, line: string) => post({ type: "log", level, line });

function* combinations(candidatesPerSlot: string[][]): Generator<string[]> {
  const counters = new Array(candidatesPerSlot.length).fill(0);
  const slots = candidatesPerSlot.length;
  while (true) {
    yield counters.map((c, i) => candidatesPerSlot[i][c]);
    let pos = slots - 1;
    while (pos >= 0) {
      counters[pos]++;
      if (counters[pos] < candidatesPerSlot[pos].length) break;
      counters[pos] = 0;
      pos--;
    }
    if (pos < 0) return;
  }
}

const shortAddr = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

self.onmessage = async (event: MessageEvent<RecoveryRequest>) => {
  const {
    candidatesPerSlot,
    passphrase,
    targetAddress,
    addressIndexCount,
    maxCombos,
    scanOnChain,
  } = event.data;

  try {
    const total = candidatesPerSlot.reduce(
      (acc, slot) => acc * Math.max(slot.length, 1),
      1,
    );

    const target = targetAddress ? normalizeAddress(targetAddress) : null;
    const matches: RecoveryMatch[] = [];
    let tested = 0;
    let validChecksums = 0;
    let checked = 0;
    let capped = false;

    log("info", `Initializing search over ${total.toLocaleString("en-US")} combinations.`);
    if (target) log("info", `Target address: ${target}`);
    else if (scanOnChain) log("info", "On-chain scan ON — checking public addresses for activity.");
    else log("info", "No target set — collecting all valid-checksum phrases.");

    const reportEvery = 2000;

    for (const combo of combinations(candidatesPerSlot)) {
      if (tested >= maxCombos) {
        capped = true;
        break;
      }
      tested++;
      const mnemonic = combo.join(" ");

      if (isValidMnemonic(mnemonic)) {
        validChecksums++;
        const addresses = deriveAddresses(mnemonic, {
          passphrase,
          addressIndexCount,
        });
        log("ok", `Valid checksum #${validChecksums}: …${mnemonic.split(" ").slice(-2).join(" ")}`);

        if (target) {
          const matchedAddress = addresses.find(
            (a) => normalizeAddress(a.address) === target,
          );
          if (matchedAddress) {
            log("hit", `MATCH! ${matchedAddress.label} ${matchedAddress.path}`);
            matches.push({ mnemonic, addresses, matchedAddress });
            post({ type: "done", tested, total, validChecksums, matches, capped });
            return;
          }
        } else if (scanOnChain) {
          for (const addr of addresses) {
            try {
              const activity = await checkActivity(addr.kind, addr.address);
              checked++;
              if (activity.hasActivity) {
                log(
                  "hit",
                  `FUNDS FOUND on ${activity.chain} ${shortAddr(addr.address)} — ${activity.balance}, ${activity.txCount} tx`,
                );
                matches.push({
                  mnemonic,
                  addresses,
                  matchedAddress: addr,
                  activity: {
                    address: addr.address,
                    chain: activity.chain,
                    balance: activity.balance,
                    txCount: activity.txCount,
                  },
                });
                post({ type: "done", tested, total, validChecksums, matches, capped });
                return;
              }
              log(
                "info",
                `${activity.chain} ${shortAddr(addr.address)} — empty (${activity.balance})`,
              );
            } catch (e) {
              log("warn", `Lookup failed for ${shortAddr(addr.address)} (${e instanceof Error ? e.message : "network"})`);
            }
            await sleep(120);
            post({ type: "progress", tested, total, validChecksums, checked });
          }
        } else {
          matches.push({ mnemonic, addresses });
          if (matches.length >= 200) {
            capped = true;
            break;
          }
        }
      }

      if (tested % reportEvery === 0) {
        post({ type: "progress", tested, total, validChecksums, checked });
      }
    }

    if (scanOnChain && matches.length === 0) {
      log("warn", `Scanned ${checked} addresses across ${validChecksums} valid phrases — no on-chain activity found.`);
    }
    log("info", `Search complete. ${tested.toLocaleString("en-US")} tested, ${validChecksums} valid.`);
    post({ type: "done", tested, total, validChecksums, matches, capped });
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
