"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PayWallet, type BalanceView, type PaymentItem, type TxPhase } from "@/lib/pay";
import { errMsg, stroopsToXlm, truncateMiddle, xlmToStroops } from "@/lib/util";
import { DEPLOYMENT } from "@/lib/deployment";
import { RevealProvider, SealedFigure } from "./amount";
import { SendPanel, type Prefill } from "./send-panel";
import { ActivityList } from "./activity";
import { ContactsPanel } from "./contacts-panel";

type Stage = "idle" | "connecting" | "unregistered" | "ready";
type Tab = "send" | "activity" | "contacts";

export default function Page() {
  const [stage, setStage] = useState<Stage>("idle");
  const [wallet, setWallet] = useState<PayWallet | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("send");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moneyMove, setMoneyMove] = useState<"add" | "withdraw" | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const walletRef = useRef<PayWallet | null>(null);

  const log = useCallback((msg: string) => {
    setStatus(msg);
    setError(null);
  }, []);

  const fail = useCallback((e: unknown) => setError(typeof e === "string" ? e : errMsg(e)), []);

  // Payment-request links: /?to=G…&amount=…&note=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const to = p.get("to");
    if (to) {
      setPrefill({ to, amount: p.get("amount") ?? "", note: p.get("note") ?? "" });
      setTab("send");
    }
  }, []);

  useEffect(() => {
    return () => {
      walletRef.current?.destroy();
    };
  }, []);

  const refresh = useCallback(async (w: PayWallet) => {
    const view = await w.refresh();
    setBalance(view);
    setStage(view.registered ? "ready" : "unregistered");
    if (view.registered) {
      setFeedLoading(true);
      try {
        setItems(await w.activity());
      } finally {
        setFeedLoading(false);
      }
    }
  }, []);

  async function connect() {
    setStage("connecting");
    setError(null);
    try {
      const w = await PayWallet.connect(log);
      walletRef.current = w;
      setWallet(w);
      log("Syncing your ledger…");
      await refresh(w);
      log("Ready");
    } catch (e) {
      fail(e);
      setStage("idle");
    }
  }

  async function createAccount() {
    if (!wallet) return;
    setBusy("register");
    try {
      await wallet.register((p: TxPhase) => log(p === "proving" ? "Proving (in your browser)…" : "Submitting…"));
      await refresh(wallet);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function collect() {
    if (!wallet) return;
    setBusy("collect");
    try {
      await wallet.collect();
      await refresh(wallet);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function submitMoneyMove() {
    if (!wallet || !moneyMove) return;
    setBusy(moneyMove);
    try {
      const stroops = xlmToStroops(moveAmount);
      if (moneyMove === "add") await wallet.addFunds(stroops);
      else await wallet.withdraw(stroops, (p) => log(p === "proving" ? "Proving withdrawal…" : "Submitting…"));
      setMoneyMove(null);
      setMoveAmount("");
      await refresh(wallet);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const payFromContacts = (address: string) => {
    setPrefill({ to: address });
    setTab("send");
  };

  return (
    <RevealProvider>
      <div className="shell">
        <header className="masthead">
          <h1 className="wordmark">
            Sealed<span className="tld">.</span>
          </h1>
          {wallet ? (
            <span className="addr-chip" title={wallet.address}>
              {truncateMiddle(wallet.address, 5, 5)}
            </span>
          ) : (
            <span className="net-tag">Stellar testnet</span>
          )}
        </header>

        {stage === "idle" || stage === "connecting" ? (
          <section className="hero">
            <h1>
              Pay anyone.
              <br />
              Reveal <em>nothing</em>.
            </h1>
            <p>
              Peer-to-peer payments on Stellar where every amount and balance is sealed on-chain as a
              Pedersen commitment and every move is proven with a zero-knowledge proof — generated
              right here in your browser.
            </p>
            <div className="steps">
              <div className="step">
                <span className="k">01</span>
                <span>Connect Freighter on testnet and sign one message to derive your sealed key.</span>
              </div>
              <div className="step">
                <span className="k">02</span>
                <span>Wrap test XLM into your sealed balance.</span>
              </div>
              <div className="step">
                <span className="k">03</span>
                <span>Pay friends — the chain sees who, never how much.</span>
              </div>
            </div>
            <button className="btn primary" onClick={connect} disabled={stage === "connecting"}>
              {stage === "connecting" ? "Connecting…" : "Connect Freighter"}
            </button>
            <p className="notice warn" style={{ marginTop: 22 }}>
              Developer preview on <strong>testnet only</strong>. The circuits and verifier are
              unaudited — never use real funds. Need test XLM? Fund your account at Stellar Lab.
            </p>
          </section>
        ) : null}

        {stage === "unregistered" && wallet && (
          <section className="card">
            <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>One step left</h2>
            <p style={{ color: "var(--ink-2)" }}>
              Creating your account binds your sealed keys to the token contract with a
              zero-knowledge proof. The proof is generated locally — expect ten seconds or so.
            </p>
            <button className="btn primary" onClick={createAccount} disabled={busy !== null}>
              {busy === "register" ? "Creating…" : "Create sealed account"}
            </button>
          </section>
        )}

        {stage === "ready" && wallet && balance && (
          <>
            <section className="card balance-card" aria-label="Balance">
              <div className="balance-label">
                <span>Sealed balance</span>
                <span
                  className={`chain-badge ${balance.matchesChain === false ? "bad" : "ok"}`}
                  title="Local state re-committed and checked against on-chain commitments"
                >
                  {balance.matchesChain === false ? "state mismatch" : "matches chain"}
                </span>
              </div>
              <div className="balance-figure">
                <SealedFigure stroops={balance.spendable} />
              </div>
              {balance.pending > 0n && (
                <div className="pending-row">
                  <span>
                    Pending: <strong>{stroopsToXlm(balance.pending)} XLM</strong> waiting to be collected
                  </span>
                  <button className="btn small primary" onClick={collect} disabled={busy !== null}>
                    {busy === "collect" ? "Collecting…" : "Collect"}
                  </button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn ghost small"
                  onClick={() => setMoneyMove(moneyMove === "add" ? null : "add")}
                >
                  Add funds
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => setMoneyMove(moneyMove === "withdraw" ? null : "withdraw")}
                >
                  Withdraw
                </button>
                <button
                  className="btn ghost small"
                  style={{ marginLeft: "auto" }}
                  onClick={() => refresh(wallet).catch(fail)}
                >
                  Sync
                </button>
              </div>
              {moneyMove && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="move-amount">
                    {moneyMove === "add"
                      ? "Amount of public XLM to seal (this deposit amount is public)"
                      : "Amount to unseal back to public XLM (this amount becomes public)"}
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="move-amount"
                      className="mono"
                      style={{ flex: 1 }}
                      inputMode="decimal"
                      placeholder="25"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                    />
                    <button className="btn primary small" onClick={submitMoneyMove} disabled={busy !== null || !moveAmount}>
                      {busy === moneyMove ? "Working…" : moneyMove === "add" ? "Seal" : "Unseal"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <nav className="tabs" role="tablist" aria-label="Sections">
              {(["send", "activity", "contacts"] as Tab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t === "send" ? "Send" : t === "activity" ? "Activity" : "Contacts"}
                </button>
              ))}
            </nav>

            {tab === "send" && (
              <SendPanel
                wallet={wallet}
                prefill={prefill}
                onError={(m) => setError(m)}
                onDone={() => {
                  setPrefill(null);
                  refresh(wallet).catch(fail);
                  setTab("activity");
                }}
              />
            )}
            {tab === "activity" && (
              <section className="card">
                <ActivityList items={items} loading={feedLoading} />
              </section>
            )}
            {tab === "contacts" && <ContactsPanel wallet={wallet} onPay={payFromContacts} />}
          </>
        )}

        <p className={`status${error ? " error" : ""}`} role="status">
          {error ?? status}
        </p>

        {stage === "ready" && (
          <p className="notice" style={{ fontSize: 12 }}>
            Sealed wraps the {DEPLOYMENT.label} ({truncateMiddle(DEPLOYMENT.contracts.token, 6, 4)}).
            Counterparty addresses stay public by design; amounts and balances stay sealed. A
            registered auditor key can decrypt transfer amounts — confidential, not anonymous. Testnet
            events are retained ~7 days: open the app at least weekly (or configure the indexer) so
            incoming payment secrets are never lost.
          </p>
        )}
      </div>
    </RevealProvider>
  );
}
