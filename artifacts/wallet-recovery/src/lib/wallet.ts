import { secp256k1 } from "@noble/curves/secp256k1.js";
import { HDKey } from "@scure/bip32";
import {
  mnemonicToSeedSync,
  validateMnemonic,
  mnemonicToEntropy,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { base58check, bech32 } from "@scure/base";

export const ENGLISH_WORDLIST = wordlist;

const WORD_SET = new Set(wordlist);

export function isValidWord(word: string): boolean {
  return WORD_SET.has(word);
}

export type AddressKind = "eth" | "btc-legacy" | "btc-segwit";

export interface DerivedAddress {
  kind: AddressKind;
  label: string;
  path: string;
  address: string;
}

export const VALID_WORD_COUNTS = [12, 15, 18, 21, 24] as const;

const b58check = base58check(sha256);

function toEip55(addressLowerHex: string): string {
  const addr = addressLowerHex.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(addr)));
  let out = "0x";
  for (let i = 0; i < addr.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return out;
}

function ethAddressFromNode(node: HDKey): string {
  if (!node.publicKey) throw new Error("missing public key");
  const point = secp256k1.Point.fromHex(bytesToHex(node.publicKey));
  const uncompressed = point.toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return toEip55(bytesToHex(hash.slice(-20)));
}

function hash160(pubkey: Uint8Array): Uint8Array {
  return ripemd160(sha256(pubkey));
}

function btcLegacyFromNode(node: HDKey): string {
  if (!node.publicKey) throw new Error("missing public key");
  const h = hash160(node.publicKey);
  const payload = new Uint8Array(21);
  payload[0] = 0x00;
  payload.set(h, 1);
  return b58check.encode(payload);
}

function btcSegwitFromNode(node: HDKey): string {
  if (!node.publicKey) throw new Error("missing public key");
  const h = hash160(node.publicKey);
  const words = bech32.toWords(h);
  return bech32.encode("bc", [0, ...words]);
}

export interface DeriveOptions {
  passphrase?: string;
  accountIndex?: number;
  addressIndexCount?: number;
}

const PATHS: { kind: AddressKind; label: string; prefix: string }[] = [
  { kind: "eth", label: "Ethereum (EVM)", prefix: "m/44'/60'/0'/0" },
  { kind: "btc-legacy", label: "Bitcoin Legacy (P2PKH)", prefix: "m/44'/0'/0'/0" },
  { kind: "btc-segwit", label: "Bitcoin SegWit (P2WPKH)", prefix: "m/84'/0'/0'/0" },
];

export function deriveAddresses(
  mnemonic: string,
  options: DeriveOptions = {},
): DerivedAddress[] {
  const { passphrase = "", addressIndexCount = 1 } = options;
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const root = HDKey.fromMasterSeed(seed);
  const results: DerivedAddress[] = [];
  for (const def of PATHS) {
    for (let i = 0; i < addressIndexCount; i++) {
      const path = `${def.prefix}/${i}`;
      const node = root.derive(path);
      let address: string;
      if (def.kind === "eth") address = ethAddressFromNode(node);
      else if (def.kind === "btc-legacy") address = btcLegacyFromNode(node);
      else address = btcSegwitFromNode(node);
      results.push({ kind: def.kind, label: def.label, path, address });
    }
  }
  return results;
}

export function isValidMnemonic(mnemonic: string): boolean {
  try {
    return validateMnemonic(mnemonic, wordlist);
  } catch {
    return false;
  }
}

export function normalizeAddress(addr: string): string {
  const trimmed = addr.trim();
  const lower = trimmed.toLowerCase();
  // EVM (0x...) is case-insensitive (EIP-55 is only a checksum).
  // Bech32 (bc1.../tb1...) is canonically lowercase and case-insensitive.
  // Base58 (BTC legacy 1.../3...) IS case-sensitive — leave it untouched.
  if (
    lower.startsWith("0x") ||
    lower.startsWith("bc1") ||
    lower.startsWith("tb1")
  ) {
    return lower;
  }
  return trimmed;
}

export function getEntropyHex(mnemonic: string): string | null {
  try {
    return bytesToHex(mnemonicToEntropy(mnemonic, wordlist));
  } catch {
    return null;
  }
}
