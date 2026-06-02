import { ENGLISH_WORDLIST, isValidWord, VALID_WORD_COUNTS } from "./wallet";
import type { DerivedAddress } from "./wallet";

export type SlotKind = "known" | "unknown" | "choices";

export interface Slot {
  index: number;
  kind: SlotKind;
  candidates: string[];
  raw: string;
}

export interface ParseResult {
  slots: Slot[];
  errors: string[];
  wordCount: number;
  totalCombos: number;
}

const FULL_UNKNOWN = "?";

function parseToken(raw: string, index: number): { slot: Slot; error?: string } {
  const token = raw.trim();

  if (token === FULL_UNKNOWN || token === "*") {
    return {
      slot: {
        index,
        kind: "unknown",
        candidates: ENGLISH_WORDLIST.slice(),
        raw: token,
      },
    };
  }

  const choiceMatch = token.match(/^\{(.+)\}$/) || token.match(/^\[(.+)\]$/);
  if (choiceMatch) {
    const parts = choiceMatch[1]
      .split(/[,|/]/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const invalid = parts.filter((p) => !isValidWord(p));
    if (parts.length === 0) {
      return {
        slot: { index, kind: "choices", candidates: [], raw: token },
        error: `Position ${index + 1}: no options provided.`,
      };
    }
    if (invalid.length > 0) {
      return {
        slot: { index, kind: "choices", candidates: parts, raw: token },
        error: `Position ${index + 1}: "${invalid.join(
          '", "',
        )}" not in the BIP39 word list.`,
      };
    }
    return {
      slot: { index, kind: "choices", candidates: parts, raw: token },
    };
  }

  const word = token.toLowerCase();
  if (!isValidWord(word)) {
    return {
      slot: { index, kind: "known", candidates: [word], raw: token },
      error: `Position ${index + 1}: "${token}" is not a valid BIP39 word. Use ? for an unknown word or {a, b} for a few options.`,
    };
  }
  return { slot: { index, kind: "known", candidates: [word], raw: token } };
}

export function parseTemplate(input: string): ParseResult {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const errors: string[] = [];
  const slots: Slot[] = [];

  tokens.forEach((tok, i) => {
    const { slot, error } = parseToken(tok, i);
    slots.push(slot);
    if (error) errors.push(error);
  });

  const wordCount = slots.length;
  if (wordCount > 0 && !VALID_WORD_COUNTS.includes(wordCount as never)) {
    errors.push(
      `A seed phrase must be ${VALID_WORD_COUNTS.join(
        ", ",
      )} words. You entered ${wordCount}.`,
    );
  }

  let totalCombos = 1;
  for (const slot of slots) {
    totalCombos *= Math.max(slot.candidates.length, 1);
  }

  return { slots, errors, wordCount, totalCombos };
}

export interface RecoveryRequest {
  candidatesPerSlot: string[][];
  passphrase: string;
  targetAddress: string | null;
  addressIndexCount: number;
  maxCombos: number;
}

export interface RecoveryMatch {
  mnemonic: string;
  addresses: DerivedAddress[];
  matchedAddress?: DerivedAddress;
}

export type WorkerOutbound =
  | { type: "progress"; tested: number; total: number; validChecksums: number }
  | {
      type: "done";
      tested: number;
      total: number;
      validChecksums: number;
      matches: RecoveryMatch[];
      capped: boolean;
    }
  | { type: "error"; message: string };
