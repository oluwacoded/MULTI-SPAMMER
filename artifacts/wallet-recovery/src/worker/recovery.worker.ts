import { deriveAddresses, isValidMnemonic, normalizeAddress } from "../lib/wallet";
import type {
  RecoveryRequest,
  RecoveryMatch,
  WorkerOutbound,
} from "../lib/recovery";

const post = (msg: WorkerOutbound) => {
  (self as unknown as Worker).postMessage(msg);
};

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

self.onmessage = (event: MessageEvent<RecoveryRequest>) => {
  const {
    candidatesPerSlot,
    passphrase,
    targetAddress,
    addressIndexCount,
    maxCombos,
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
    let capped = false;

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

        if (target) {
          const matchedAddress = addresses.find(
            (a) => normalizeAddress(a.address) === target,
          );
          if (matchedAddress) {
            matches.push({ mnemonic, addresses, matchedAddress });
            post({
              type: "done",
              tested,
              total,
              validChecksums,
              matches,
              capped,
            });
            return;
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
        post({ type: "progress", tested, total, validChecksums });
      }
    }

    post({ type: "done", tested, total, validChecksums, matches, capped });
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
