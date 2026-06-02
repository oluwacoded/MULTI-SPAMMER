---
name: scure/noble v2 API quirks
description: Non-obvious import + API changes in @scure/@noble v2 used for browser crypto (BIP39/BIP32/secp256k1).
---

When using @scure/bip39, @scure/bip32, @scure/base, @noble/hashes, @noble/curves at v2.x in a browser (Vite) artifact:

- Subpath imports require the `.js` suffix in v2: `@noble/hashes/sha3.js`, `@noble/hashes/sha2.js`, `@noble/hashes/legacy.js` (ripemd160 lives in `legacy.js`), `@noble/curves/secp256k1.js`, `@scure/bip39/wordlists/english.js`. Bare paths without `.js` throw `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- `@noble/curves` v2 renamed `ProjectivePoint` → `Point`. `secp256k1.Point.fromHex(...)` expects a **hex string**, not a `Uint8Array` — convert with `bytesToHex(node.publicKey)` first. Get uncompressed bytes via `point.toBytes(false)` (not `toRawBytes`).

**Why:** these changed between v1 and v1—saved hours of trial/error wiring ETH/BTC derivation. ETH/BTC derivation verified against the canonical "abandon...about" and "legal winner..." BIP39 vectors.

**How to apply:** reach for these exact import paths and the `Point.fromHex(bytesToHex(...))` pattern whenever deriving secp256k1 addresses in a v2 browser crypto build.
