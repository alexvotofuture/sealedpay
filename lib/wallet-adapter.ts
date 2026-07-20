/**
 * Freighter wallet adapter + deterministic confidential-key derivation.
 *
 * The confidential spending key `sk` is derived from a Freighter signMessage
 * signature (Ed25519 is deterministic per RFC 8032), so it is recoverable on
 * any device without ever leaving the browser. The message text below is
 * byte-identical to the upstream demo's derivation message ON PURPOSE: keys
 * are a function of (account, message), so keeping the message identical means
 * an account registered through the demo app resolves to the same confidential
 * account here, and vice versa.
 *
 * Adapted from the upstream demo (MIT).
 */
import {
  isConnected,
  requestAccess,
  signTransaction,
  signMessage as freighterSignMessage,
} from "@stellar/freighter-api";
import { frMod, fromBytesBE, type Signer } from "@ctd/sdk";
import { DEPLOYMENT } from "./deployment";
import { errMsg } from "./util";

export interface MessageSigner extends Signer {
  signMessage(message: string): Promise<Uint8Array>;
}

export async function connectFreighter(): Promise<MessageSigner> {
  const conn = await isConnected();
  if (!conn.isConnected) {
    throw new Error("Freighter not detected — install the Freighter extension and reload.");
  }
  const access = await requestAccess();
  if (access.error) throw new Error(errMsg(access.error));
  const address = access.address;

  return {
    publicKey: address,
    async sign(txXdrBase64: string): Promise<string> {
      const res = await signTransaction(txXdrBase64, {
        networkPassphrase: DEPLOYMENT.networkPassphrase,
        address,
      });
      if (res.error) throw new Error(errMsg(res.error));
      return res.signedTxXdr;
    },
    async signMessage(message: string): Promise<Uint8Array> {
      const res = await freighterSignMessage(message, {
        networkPassphrase: DEPLOYMENT.networkPassphrase,
        address,
      });
      if (res.error) throw new Error(errMsg(res.error));
      if (res.signerAddress !== address) {
        throw new Error(`Freighter signed with ${res.signerAddress}, expected ${address}`);
      }
      return normalizeSignature(res.signedMessage);
    },
  };
}

/** Freighter v4 returns base64; v3 a structured-cloned Buffer. */
function normalizeSignature(signed: unknown): Uint8Array {
  if (typeof signed === "string") {
    return Uint8Array.from(atob(signed), (c) => c.charCodeAt(0));
  }
  if (signed instanceof Uint8Array) return new Uint8Array(signed);
  if (signed && typeof signed === "object" && Array.isArray((signed as { data?: unknown }).data)) {
    return Uint8Array.from((signed as { data: number[] }).data);
  }
  throw new Error("Freighter returned no usable message signature");
}

// ------------------------------------------------------- key derivation ----

/** MUST stay byte-identical to the upstream demo (account portability). */
export function keyDerivationMessage(networkPassphrase: string, tokenContract: string): string {
  return [
    "Confidential Token Demo — key derivation v1",
    "",
    "Signing this message derives your confidential spending key.",
    "Only sign it on the official Confidential Token Demo app.",
    "",
    `Network: ${networkPassphrase}`,
    `Token contract: ${tokenContract}`,
  ].join("\n");
}

/** Hash a message signature into a nonzero F_r scalar. */
export async function skFromSignature(signature: Uint8Array): Promise<bigint> {
  const digest = await crypto.subtle.digest("SHA-512", signature as BufferSource);
  const sk = frMod(fromBytesBE(new Uint8Array(digest)));
  if (sk === 0n) throw new Error("degenerate key derivation (zero scalar)");
  return sk;
}
