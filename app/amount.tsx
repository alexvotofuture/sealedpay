"use client";

/**
 * SealedAmount — amounts render sealed (masked) by default and unseal on tap.
 * The chip keeps the same silhouette either way, so revealing shifts nothing.
 * A global toggle (the eye on the balance card) breaks or restores every seal
 * at once; the preference lives in sessionStorage, so it resets when the tab
 * closes. Publicly-visible amounts (deposits/withdrawals) render unsealed and
 * uninteractive — the UI never pretends the chain hides what it doesn't.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { stroopsToXlm } from "@/lib/util";

const RevealContext = createContext<{ revealed: boolean; toggle: () => void }>({
  revealed: false,
  toggle: () => {},
});

const SESSION_KEY = "pay:reveal";

export function RevealProvider({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);
  const toggle = useCallback(() => {
    setRevealed((r) => {
      sessionStorage.setItem(SESSION_KEY, r ? "0" : "1");
      return !r;
    });
  }, []);
  return <RevealContext.Provider value={{ revealed, toggle }}>{children}</RevealContext.Provider>;
}

export function useReveal() {
  return useContext(RevealContext);
}

export function SealedAmount({
  stroops,
  isPublic = false,
  sign,
}: {
  /** null → this device can't decrypt it. */
  stroops: bigint | null;
  /** Amount is public on-chain (deposit/withdraw) — no seal to break. */
  isPublic?: boolean;
  sign?: "+" | "−";
}) {
  const { revealed } = useReveal();
  const [localOpen, setLocalOpen] = useState(false);
  const open = revealed || localOpen;

  if (stroops === null) {
    return (
      <span className="seal-chip public" title="Sealed on-chain; not decryptable on this device">
        sealed
      </span>
    );
  }

  const text = `${sign ?? ""}${stroopsToXlm(stroops)} XLM`;

  if (isPublic) {
    return <span className="seal-chip public">{text}</span>;
  }

  return (
    <button
      type="button"
      className={`seal-chip${open ? " open" : ""}`}
      onClick={() => setLocalOpen((o) => !o)}
      aria-label={open ? "Seal amount" : "Reveal amount"}
      title={open ? "Tap to seal" : "Only you can read this — tap to reveal"}
    >
      <span className="wax" aria-hidden />
      {open ? <span className="seal-reveal">{text}</span> : <span aria-hidden>•••</span>}
    </button>
  );
}

/** The balance headline variant — big mono figure behind one big seal. */
export function SealedFigure({ stroops }: { stroops: bigint }) {
  const { revealed, toggle } = useReveal();
  return (
    <button
      type="button"
      className="seal-big"
      onClick={toggle}
      aria-label={revealed ? "Seal balances" : "Reveal balances"}
    >
      {revealed ? (
        <span className="seal-reveal">
          {stroopsToXlm(stroops)} <span className="unit">XLM</span>
        </span>
      ) : (
        <span className="masked" aria-hidden>
          ••••••
        </span>
      )}
    </button>
  );
}
