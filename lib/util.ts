/**
 * Shared helpers, adapted from the upstream demo (MIT).
 */
import { ChainClient, IndexerClient, humanizeContractError } from "@ctd/sdk";
import { DEPLOYMENT } from "./deployment";

// ---------------------------------------------------------------- errors ----

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown };
    if (typeof o.message === "string") {
      return o.code !== undefined ? `${o.message} (code ${String(o.code)})` : o.message;
    }
    try {
      return JSON.stringify(e);
    } catch {
      /* fall through */
    }
  }
  return String(e);
}

/** Render any thrown value (Error, JSON-RPC error object, …) as readable text. */
export function errMsg(e: unknown): string {
  const raw = rawMessage(e);
  return humanizeContractError(raw) ?? raw;
}

// --------------------------------------------------------------- amounts ----

export const STROOPS_PER_XLM = 10_000_000n;
const XLM_DECIMALS = 7;

/** Parse a human decimal XLM amount into stroops. Throws on malformed input. */
export function xlmToStroops(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Enter an amount like 12.5`);
  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > XLM_DECIMALS) throw new Error(`Max ${XLM_DECIMALS} decimal places`);
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(frac.padEnd(XLM_DECIMALS, "0"));
}

/** Format stroops as a human XLM string, trailing zeros trimmed. */
export function stroopsToXlm(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const frac = abs % STROOPS_PER_XLM;
  const sign = neg ? "-" : "";
  if (frac === 0n) return `${sign}${whole}`;
  const fracStr = frac.toString().padStart(XLM_DECIMALS, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracStr}`;
}

/** "GABC…WXYZ"-style middle truncation for addresses and hashes. */
export function truncateMiddle(value: string, head = 4, tail = 4): string {
  return value ? `${value.slice(0, head)}…${value.slice(-tail)}` : "—";
}

/** Loose G-address shape check for form validation (not full strkey). */
export function looksLikeAccount(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

// ------------------------------------------------------------------- rpc ----

export function makeClients(): { client: ChainClient; indexer?: IndexerClient } {
  const client = new ChainClient({
    rpcUrl: DEPLOYMENT.rpcUrl,
    networkPassphrase: DEPLOYMENT.networkPassphrase,
    contracts: DEPLOYMENT.contracts,
  });
  const indexer = DEPLOYMENT.indexerUrl
    ? new IndexerClient({ baseUrl: DEPLOYMENT.indexerUrl })
    : undefined;
  return { client, indexer };
}
