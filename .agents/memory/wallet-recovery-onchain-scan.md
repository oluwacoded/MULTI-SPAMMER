---
name: Wallet recovery on-chain scan
description: Privacy boundary and accuracy constraints for the optional on-chain balance scan in the wallet-recovery artifact
---

The wallet-recovery tool is sold on "your seed phrase never leaves this device." It has an OPTIONAL on-chain scan (used only when no known address is given) that derives addresses per valid-checksum mnemonic and queries public block explorers to find the funded wallet.

**Privacy rule:** the scan may send only *public addresses*, never the mnemonic/seed/passphrase. Keep `checkActivity()` taking an address (never seed material). Any UI claim like "100% offline" / "nothing sent" must be gated on the effective run mode (`scanActive = scanOnChain && !targetAddress.trim()`), not shown unconditionally — otherwise the security copy is a lie in scan mode.

**Why:** a recovery tool that leaks the seed is catastrophic; and contradictory privacy badges erode trust. A code review previously failed the feature for unconditional "offline" claims.

**How to apply:** capture the effective mode at run start (runWithScan/runWithTarget) and branch result labels/toasts on those, not the live toggle (the switch is disabled-but-still-true once a target is typed).

**Accuracy gotcha:** ETH "txCount" comes from `eth_getTransactionCount` (nonce = outbound txs only); a receive-only ETH wallet shows 0 txs but nonzero balance, so detection uses `balance>0 || nonce>0`. BTC via blockstream `chain_stats.tx_count` counts all txs. Don't claim ETH "transaction history" — say "balance or transaction history" generically and rely on balance for receive-only.

Endpoints (no API key, CORS-friendly, callable from a Web Worker): BTC `https://blockstream.info/api/address/<addr>`, ETH JSON-RPC `https://ethereum-rpc.publicnode.com`.
