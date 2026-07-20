"use client";

import { useEffect, useState } from "react";
import type { PayWallet, TxPhase } from "@/lib/pay";
import { xlmToStroops, looksLikeAccount, truncateMiddle, errMsg } from "@/lib/util";
import { listContacts, saveContact, saveNote, type Contact } from "@/lib/contacts";

export interface Prefill {
  to?: string;
  amount?: string;
  note?: string;
}

const PHASE_LABEL: Record<TxPhase, string> = {
  merging: "Collecting pending…",
  proving: "Proving (stays on your device)…",
  submitting: "Submitting…",
};

export function SendPanel({
  wallet,
  prefill,
  onDone,
  onError,
}: {
  wallet: PayWallet;
  prefill: Prefill | null;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"send" | "request">("send");
  const [to, setTo] = useState(prefill?.to ?? "");
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [note, setNote] = useState(prefill?.note ?? "");
  const [saveAs, setSaveAs] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [phase, setPhase] = useState<TxPhase | null>(null);
  const [requestLink, setRequestLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setContacts(listContacts()), []);
  useEffect(() => {
    if (prefill) {
      setMode("send");
      setTo(prefill.to ?? "");
      setAmount(prefill.amount ?? "");
      setNote(prefill.note ?? "");
    }
  }, [prefill]);

  const busy = phase !== null;
  const toValid = looksLikeAccount(to);

  async function submitSend() {
    let stroops: bigint;
    try {
      stroops = xlmToStroops(amount);
      if (stroops <= 0n) throw new Error("Amount must be positive");
    } catch (e) {
      onError(errMsg(e));
      return;
    }
    try {
      const hash = await wallet.send(to.trim(), stroops, setPhase);
      if (note.trim()) saveNote(hash, note);
      if (saveAs.trim()) setContacts(saveContact({ address: to.trim(), name: saveAs.trim() }));
      setTo("");
      setAmount("");
      setNote("");
      setSaveAs("");
      onDone();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setPhase(null);
    }
  }

  function buildRequest() {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("to", wallet.address);
    if (amount) url.searchParams.set("amount", amount);
    if (note.trim()) url.searchParams.set("note", note.trim());
    setRequestLink(url.toString());
    setCopied(false);
  }

  async function copyRequest() {
    if (!requestLink) return;
    await navigator.clipboard.writeText(requestLink);
    setCopied(true);
  }

  return (
    <div className="card">
      <div className="mode-switch" role="tablist" aria-label="Send or request">
        <button role="tab" aria-selected={mode === "send"} onClick={() => setMode("send")}>
          Send
        </button>
        <button role="tab" aria-selected={mode === "request"} onClick={() => setMode("request")}>
          Request
        </button>
      </div>

      {mode === "send" ? (
        <>
          <div className="field">
            <label htmlFor="send-to">To</label>
            {contacts.length > 0 && (
              <select
                aria-label="Pick a contact"
                value=""
                onChange={(e) => e.target.value && setTo(e.target.value)}
              >
                <option value="">Pick a contact…</option>
                {contacts.map((c) => (
                  <option key={c.address} value={c.address}>
                    {c.name} ({truncateMiddle(c.address)})
                  </option>
                ))}
              </select>
            )}
            <input
              id="send-to"
              className="mono"
              placeholder="G… Stellar address"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            {to && !toValid && <span className="hint">Stellar addresses start with G and are 56 characters.</span>}
          </div>
          <div className="field">
            <label htmlFor="send-amount">Amount (XLM)</label>
            <input
              id="send-amount"
              className="mono"
              placeholder="12.5"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="hint">The amount is sealed on-chain — only you, the recipient, and the auditor can read it.</span>
          </div>
          <div className="field">
            <label htmlFor="send-note">Note (stays on this device)</label>
            <input
              id="send-note"
              placeholder="dinner 🍜"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={80}
            />
          </div>
          {toValid && !contacts.some((c) => c.address === to.trim()) && (
            <div className="field">
              <label htmlFor="send-saveas">Save contact as (optional)</label>
              <input id="send-saveas" placeholder="Alice" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} />
            </div>
          )}
          <button
            className="btn primary wide"
            disabled={busy || !toValid || !amount}
            onClick={submitSend}
          >
            {busy ? PHASE_LABEL[phase!] : "Pay sealed"}
          </button>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0, color: "var(--ink-2)" }}>
            Build a link that opens this app with your address and amount pre-filled. Share it however
            you like — the payment itself will still be sealed.
          </p>
          <div className="field">
            <label htmlFor="req-amount">Amount (XLM, optional)</label>
            <input
              id="req-amount"
              className="mono"
              placeholder="12.5"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="req-note">What it's for (optional, visible in the link)</label>
            <input id="req-note" placeholder="my half of rent" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
          </div>
          <button className="btn primary wide" onClick={buildRequest}>
            Create request link
          </button>
          {requestLink && (
            <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <input className="mono" readOnly value={requestLink} onFocus={(e) => e.target.select()} />
              <button className="btn ghost small" onClick={copyRequest} style={{ alignSelf: "flex-start" }}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
