import type { AddressKind } from "./wallet";

export interface ActivityResult {
  address: string;
  chain: string;
  txCount: number;
  balance: string;
  hasActivity: boolean;
}

const BTC_API = "https://blockstream.info/api";
const ETH_RPC = "https://ethereum-rpc.publicnode.com";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

function formatBtc(sats: number): string {
  return `${(sats / 1e8).toFixed(8)} BTC`;
}

function formatEthWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
  return `${whole.toString()}.${frac} ETH`;
}

function formatEth(weiHex: string): string {
  return formatEthWei(BigInt(weiHex));
}

async function checkBtc(address: string): Promise<ActivityResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${BTC_API}/address/${address}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`BTC API ${res.status}`);
    const data = (await res.json()) as {
      chain_stats: {
        funded_txo_sum: number;
        spent_txo_sum: number;
        tx_count: number;
      };
      mempool_stats: { tx_count: number };
    };
    const stats = data.chain_stats;
    const balanceSats = stats.funded_txo_sum - stats.spent_txo_sum;
    const txCount = stats.tx_count + data.mempool_stats.tx_count;
    return {
      address,
      chain: "BTC",
      txCount,
      balance: formatBtc(balanceSats),
      hasActivity: txCount > 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function ethRpc(method: string, params: unknown[]): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(ETH_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ETH RPC ${res.status}`);
    const data = (await res.json()) as { result?: string; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);
    return data.result ?? "0x0";
  } finally {
    clearTimeout(timer);
  }
}

async function checkEth(address: string): Promise<ActivityResult> {
  const [balanceHex, nonceHex] = await Promise.all([
    ethRpc("eth_getBalance", [address, "latest"]),
    ethRpc("eth_getTransactionCount", [address, "latest"]),
  ]);
  const txCount = Number(BigInt(nonceHex));
  const balanceWei = BigInt(balanceHex);
  return {
    address,
    chain: "ETH",
    txCount,
    balance: formatEth(balanceHex),
    hasActivity: txCount > 0 || balanceWei > 0n,
  };
}

export async function checkActivity(
  kind: AddressKind,
  address: string,
): Promise<ActivityResult> {
  if (kind === "eth") return checkEth(address);
  return checkBtc(address);
}

export interface TxSummary {
  hash: string;
  time: number | null;
  direction: "in" | "out" | "self" | "unknown";
  amount: string;
  url: string;
}

export function explorerAddressUrl(kind: AddressKind, address: string): string {
  return kind === "eth"
    ? `https://etherscan.io/address/${address}`
    : `https://blockstream.info/address/${address}`;
}

interface BtcTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

async function btcRecentTxs(address: string): Promise<TxSummary[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${BTC_API}/address/${address}/txs`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`BTC API ${res.status}`);
    const data = (await res.json()) as BtcTx[];
    return data.slice(0, 8).map((tx) => {
      const out = tx.vout
        .filter((o) => o.scriptpubkey_address === address)
        .reduce((s, o) => s + o.value, 0);
      const inn = tx.vin
        .filter((v) => v.prevout?.scriptpubkey_address === address)
        .reduce((s, v) => s + (v.prevout?.value ?? 0), 0);
      const net = out - inn;
      return {
        hash: tx.txid,
        time: tx.status.block_time ?? null,
        direction: net > 0 ? "in" : net < 0 ? "out" : "self",
        amount: formatBtc(Math.abs(net)),
        url: `https://blockstream.info/tx/${tx.txid}`,
      } as TxSummary;
    });
  } finally {
    clearTimeout(timer);
  }
}

interface BlockscoutTx {
  hash: string;
  timestamp?: string;
  value?: string;
  from?: { hash?: string };
  to?: { hash?: string };
}

async function ethRecentTxs(address: string): Promise<TxSummary[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `https://eth.blockscout.com/api/v2/addresses/${address}/transactions`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Blockscout ${res.status}`);
    const data = (await res.json()) as { items?: BlockscoutTx[] };
    const me = address.toLowerCase();
    return (data.items ?? []).slice(0, 8).map((it) => {
      const from = (it.from?.hash ?? "").toLowerCase();
      const to = (it.to?.hash ?? "").toLowerCase();
      const direction =
        from === me && to === me
          ? "self"
          : from === me
            ? "out"
            : to === me
              ? "in"
              : "unknown";
      return {
        hash: it.hash,
        time: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null,
        direction,
        amount: formatEthWei(BigInt(it.value ?? "0")),
        url: `https://etherscan.io/tx/${it.hash}`,
      } as TxSummary;
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getRecentTransactions(
  kind: AddressKind,
  address: string,
): Promise<TxSummary[]> {
  if (kind === "eth") return ethRecentTxs(address);
  return btcRecentTxs(address);
}

export { withTimeout };
