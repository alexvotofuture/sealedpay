/**
 * PayWallet — P2P-payments orchestration over @ctd/sdk.
 *
 * Adapted from the upstream demo's ConfidentialWallet (MIT) and reshaped for a
 * payments product:
 *
 *  - `send()` is smart: if the spendable balance can't cover the payment but
 *    spendable + pending (receiving) can, it merges first, then transfers —
 *    one intent, the app sequences the protocol steps.
 *  - `activity()` returns payment-shaped items with amounts decrypted locally
 *    (your viewing key for inbound, deterministic ephemeral-scalar recovery
 *    for outbound). Amounts stay confidential on-chain either way.
 *
 * All proving happens in the browser (bb.js); the confidential `sk` never
 * leaves the device. State is reconstructed from RPC events (~7-day retention
 * on testnet) and persisted locally — sync at least once per retention window
 * or configure the optional indexer (see README).
 */
import {
  type ChainClient,
  type IndexerClient,
  type OnChainAccount,
  type KeyPair,
  type CircuitProver,
  type ConfidentialEvent,
  type TransferEvent,
  deriveKeys,
  addressToField,
  toHex32,
  fromHex,
  StateEngine,
  LocalStorageStore,
  proverFromArtifact,
  buildRegisterWitness,
  buildWithdrawWitness,
  buildTransferWitness,
  submitRegister,
  submitDeposit,
  submitMerge,
  submitWithdraw,
  submitTransfer,
  hybridFetchEvents,
  deriveEphemeralRE,
  scalarMul,
  H,
  pointCoords,
  ecdh,
  decryptWithDomain,
  DOMAIN,
} from "@ctd/sdk";
import registerCircuit from "@ctd/sdk/circuits/register.json";
import withdrawCircuit from "@ctd/sdk/circuits/withdraw.json";
import transferCircuit from "@ctd/sdk/circuits/transfer.json";

import { DEPLOYMENT } from "./deployment";
import { makeClients, stroopsToXlm, truncateMiddle } from "./util";
import { connectFreighter, keyDerivationMessage, skFromSignature, type MessageSigner } from "./wallet-adapter";
import { ensureBrowserBackend } from "./bb-loader";

type Log = (msg: string) => void;
type CircuitName = "register" | "withdraw" | "transfer";

const CIRCUITS: Record<CircuitName, { bytecode: string } & Record<string, unknown>> = {
  register: registerCircuit as never,
  withdraw: withdrawCircuit as never,
  transfer: transferCircuit as never,
};

/** Coarse progress for proof-carrying operations (drives button labels). */
export type TxPhase = "merging" | "proving" | "submitting";

export interface BalanceView {
  registered: boolean;
  /** Spendable now. */
  spendable: bigint;
  /** Pending — received or deposited, not yet collected (merged). */
  pending: bigint;
  syncedLedger: number;
  /** null before registration; otherwise local-state-vs-chain check result. */
  matchesChain: boolean | null;
}

/** One row of the activity feed, payment-shaped. */
export interface PaymentItem {
  kind: "sent" | "received" | "added" | "withdrew" | "collected" | "joined";
  /** The other side, when there is one. */
  counterparty?: string;
  /**
   * Amount in stroops. null on a confidential transfer whose amount this
   * device can't decrypt (e.g. sent from other keys), and on merges (the
   * chain never learns a merge's value — neither do we, retroactively).
   */
  amount: bigint | null;
  /** True when the amount was public on-chain (deposits/withdrawals). */
  amountPublic: boolean;
  txHash: string;
  ledger: number;
}

export class PayWallet {
  private provers = new Map<CircuitName, CircuitProver>();
  private inFlightEvents: Promise<ConfidentialEvent[]> | null = null;

  private constructor(
    readonly address: string,
    private signer: MessageSigner,
    private keys: KeyPair,
    private client: ChainClient,
    private indexer: IndexerClient | undefined,
    private engine: StateEngine,
    private log: Log,
  ) {}

  static async connect(log: Log): Promise<PayWallet> {
    ensureBrowserBackend();
    const signer = await connectFreighter();
    log(`Connected ${truncateMiddle(signer.publicKey)}`);

    const { client, indexer } = makeClients();
    const tokenId = DEPLOYMENT.contracts.token;
    const addrF = addressToField(tokenId);

    // Same cache key + derivation message as the upstream demo: an account
    // registered there is the same confidential account here.
    const skKey = `ctd:sk:${tokenId}:${signer.publicKey}`;
    let sk: bigint;
    const stored = typeof window !== "undefined" ? localStorage.getItem(skKey) : null;
    if (stored) {
      sk = fromHex(stored);
    } else {
      log("Approve the key-derivation message in Freighter…");
      const signature = await signer.signMessage(
        keyDerivationMessage(DEPLOYMENT.networkPassphrase, tokenId),
      );
      sk = await skFromSignature(signature);
      localStorage.setItem(skKey, toHex32(sk));
      log("Confidential key derived from your wallet signature");
    }
    const keys = deriveKeys(sk, addrF);

    const engine = new StateEngine({
      client,
      store: new LocalStorageStore(`ctd:state:${tokenId}:`),
      keys,
      address: signer.publicKey,
      fromLedger: DEPLOYMENT.deployedAtLedger,
      indexer,
    });

    return new PayWallet(signer.publicKey, signer, keys, client, indexer, engine, log);
  }

  private prover(name: CircuitName): CircuitProver {
    let p = this.provers.get(name);
    if (!p) {
      p = proverFromArtifact(CIRCUITS[name]);
      this.provers.set(name, p);
    }
    return p;
  }

  /** On-chain confidential account record (null → not registered). */
  async account(): Promise<OnChainAccount | null> {
    return this.client.confidentialBalance(this.address);
  }

  async isRegistered(address: string): Promise<boolean> {
    return (await this.client.confidentialBalance(address)) !== null;
  }

  // -------------------------------------------------------------- actions ----

  /** One-time: bind this device's confidential keys to the token contract. */
  async register(onPhase?: (p: TxPhase) => void): Promise<void> {
    const w = buildRegisterWitness(this.keys);
    onPhase?.("proving");
    this.log("Proving registration…");
    const { proof } = await this.prover("register").prove(w.inputs);
    onPhase?.("submitting");
    this.log("Submitting…");
    const r = await submitRegister(
      this.client,
      this.signer,
      this.address,
      DEPLOYMENT.auditorId,
      w,
      proof,
    );
    this.log(`Account created (tx ${truncateMiddle(r.hash, 8, 4)})`);
  }

  /** Public XLM → confidential pending balance. Amount is public (by design). */
  async addFunds(amount: bigint): Promise<void> {
    this.log(`Adding ${stroopsToXlm(amount)} XLM…`);
    const r = await submitDeposit(this.client, this.signer, this.address, this.address, amount);
    this.log(`Added (tx ${truncateMiddle(r.hash, 8, 4)}) — now in pending`);
  }

  /** Fold pending into spendable (homomorphic add, no proof, one signature). */
  async collect(): Promise<void> {
    this.log("Collecting pending balance…");
    const r = await submitMerge(this.client, this.signer, this.address);
    this.log(`Collected (tx ${truncateMiddle(r.hash, 8, 4)})`);
  }

  /**
   * Pay someone. Sequences merge → prove → transfer as needed so the caller
   * expresses one intent. Returns the transfer's tx hash (attach local notes
   * to it if you like).
   */
  async send(to: string, amount: bigint, onPhase?: (p: TxPhase) => void): Promise<string> {
    if (to === this.address) throw new Error("That's your own address");
    const recipient = await this.client.confidentialBalance(to);
    if (!recipient) {
      throw new Error(
        "Recipient hasn't set up confidential payments yet — ask them to open the app and create an account first",
      );
    }

    let s = await this.engine.sync();
    if (s.spendable.v < amount) {
      if (s.spendable.v + s.receiving.v >= amount) {
        onPhase?.("merging");
        await this.collect();
        s = await this.engine.sync();
      }
      if (s.spendable.v < amount) {
        throw new Error(
          `Not enough balance — you can spend ${stroopsToXlm(s.spendable.v + s.receiving.v)} XLM`,
        );
      }
    }

    const [kAudR, kAudS] = await Promise.all([
      this.client.auditorKey(recipient.auditorId),
      this.client.auditorKey(DEPLOYMENT.auditorId),
    ]);

    const w = buildTransferWitness({
      keys: this.keys,
      v: s.spendable.v,
      r: s.spendable.r,
      amount,
      pvkB: recipient.viewingPublicKey,
      kAudR,
      kAudS,
    });
    onPhase?.("proving");
    this.log("Proving payment (≈10–30s in-browser)…");
    const { proof } = await this.prover("transfer").prove(w.inputs);
    onPhase?.("submitting");
    this.log("Submitting…");
    const r = await submitTransfer(this.client, this.signer, this.address, to, w, proof);
    await this.engine.setSpendable(w.next);
    this.log(`Paid ${truncateMiddle(to)} (tx ${truncateMiddle(r.hash, 8, 4)})`);
    return r.hash;
  }

  /** Confidential spendable → public XLM. Amount becomes public (by design). */
  async withdraw(amount: bigint, onPhase?: (p: TxPhase) => void): Promise<void> {
    const s = await this.engine.sync();
    if (s.spendable.v < amount) {
      throw new Error(`Not enough spendable balance (${stroopsToXlm(s.spendable.v)} XLM)`);
    }
    const kAudS = await this.client.auditorKey(DEPLOYMENT.auditorId);
    const w = buildWithdrawWitness({ keys: this.keys, v: s.spendable.v, r: s.spendable.r, amount, kAudS });
    onPhase?.("proving");
    this.log("Proving withdrawal…");
    const { proof } = await this.prover("withdraw").prove(w.inputs);
    onPhase?.("submitting");
    this.log("Submitting…");
    const r = await submitWithdraw(this.client, this.signer, this.address, this.address, amount, w, proof);
    await this.engine.setSpendable(w.next);
    this.log(`Withdrew ${stroopsToXlm(amount)} XLM to public (tx ${truncateMiddle(r.hash, 8, 4)})`);
  }

  // -------------------------------------------------------------- reading ----

  /** Sync from chain events and return the balance view. */
  async refresh(): Promise<BalanceView> {
    const state = await this.engine.sync();
    const onchain = await this.account();
    let matchesChain: boolean | null = null;
    if (onchain) matchesChain = (await this.engine.verifyAgainstChain()).ok;
    return {
      registered: onchain !== null,
      spendable: state.spendable.v,
      pending: state.receiving.v,
      syncedLedger: state.syncedLedger,
      matchesChain,
    };
  }

  /** Payment-shaped activity for this account, newest first. */
  async activity(): Promise<PaymentItem[]> {
    const events = await this.fetchAllEvents();
    const items: PaymentItem[] = [];
    for (const ev of events) {
      const item = await this.toItem(ev);
      if (item) items.push(item);
    }
    return items.reverse();
  }

  /** Accounts with a register event — potential recipients. Retention-limited without an indexer. */
  async knownRecipients(): Promise<string[]> {
    const seen = new Set<string>();
    for (const ev of await this.fetchAllEvents()) {
      if (ev.type === "register" && ev.account !== this.address) seen.add(ev.account);
    }
    return [...seen];
  }

  private async toItem(ev: ConfidentialEvent): Promise<PaymentItem | null> {
    const base = { txHash: ev.txHash, ledger: ev.ledger };
    switch (ev.type) {
      case "register":
        return ev.account === this.address
          ? { ...base, kind: "joined", amount: null, amountPublic: false }
          : null;
      case "merge":
        return ev.account === this.address
          ? { ...base, kind: "collected", amount: null, amountPublic: false }
          : null;
      case "deposit":
        return ev.to === this.address
          ? { ...base, kind: "added", amount: ev.amount, amountPublic: true }
          : null;
      case "withdraw":
        return ev.from === this.address
          ? { ...base, kind: "withdrew", amount: ev.amount, amountPublic: true }
          : null;
      case "transfer": {
        if (ev.to === this.address) {
          return {
            ...base,
            kind: "received",
            counterparty: ev.from,
            amount: await this.transferAmount(ev),
            amountPublic: false,
          };
        }
        if (ev.from === this.address) {
          return {
            ...base,
            kind: "sent",
            counterparty: ev.to,
            amount: await this.transferAmount(ev),
            amountPublic: false,
          };
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Decrypt a confidential transfer's amount for local display, from whichever
   * side this wallet is on. Inbound: ECDH with our viewing key. Outbound:
   * re-derive the deterministic ephemeral scalar from (vk, sigma) and ECDH
   * against the recipient's registered viewing key. null → not recoverable
   * here; the amount stays confidential on-chain regardless.
   */
  private async transferAmount(event: TransferEvent): Promise<bigint | null> {
    if (event.to === this.address) {
      return this.engine.decryptIncoming(event.rE, event.vTilde, event.sigma).vTx;
    }
    if (event.from === this.address) {
      const eventRE = pointCoords(event.rE);
      const derived = deriveEphemeralRE(this.keys.vk, event.sigma);
      const derivedRE = pointCoords(scalarMul(derived, H));
      if (derivedRE.x !== eventRE.x || derivedRE.y !== eventRE.y) return null;
      const recipient = await this.client.confidentialBalance(event.to);
      if (!recipient) return null;
      const sBx = ecdh(derived, recipient.viewingPublicKey);
      const vTx = decryptWithDomain(event.vTilde, DOMAIN.TX_AMOUNT, sBx, event.sigma);
      if (vTx >= 1n << 127n) return null; // wrong key ⇒ garbage outside amount range
      return vTx;
    }
    return null;
  }

  private async fetchAllEvents(): Promise<ConfidentialEvent[]> {
    if (this.inFlightEvents) return this.inFlightEvents;
    const fetch = hybridFetchEvents(this.client, this.indexer, {
      fromLedger: DEPLOYMENT.deployedAtLedger,
    }).then((r) => r.events);
    this.inFlightEvents = fetch;
    try {
      return await fetch;
    } finally {
      this.inFlightEvents = null;
    }
  }

  /** Free cached provers (worker + wasm) before discarding this wallet. */
  async destroy(): Promise<void> {
    await Promise.all([...this.provers.values()].map((p) => p.destroy()));
    this.provers.clear();
  }
}
