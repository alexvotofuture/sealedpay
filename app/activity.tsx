"use client";

import type { PaymentItem } from "@/lib/pay";
import { truncateMiddle } from "@/lib/util";
import { contactName, noteFor } from "@/lib/contacts";
import { SealedAmount } from "./amount";

const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";

function rowMeta(item: PaymentItem): { glyph: string; incoming: boolean; title: string } {
  const who = item.counterparty
    ? contactName(item.counterparty) ?? truncateMiddle(item.counterparty)
    : "";
  switch (item.kind) {
    case "sent":
      return { glyph: "↗", incoming: false, title: `Paid ${who}` };
    case "received":
      return { glyph: "↘", incoming: true, title: `Received from ${who}` };
    case "added":
      return { glyph: "＋", incoming: true, title: "Added funds" };
    case "withdrew":
      return { glyph: "⇱", incoming: false, title: "Withdrew to public XLM" };
    case "collected":
      return { glyph: "▣", incoming: false, title: "Collected pending" };
    case "joined":
      return { glyph: "✳", incoming: false, title: "Account created" };
  }
}

export function ActivityList({ items, loading }: { items: PaymentItem[]; loading: boolean }) {
  if (loading && items.length === 0) {
    return <div className="empty">Reading your ledger…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="empty">
        <strong>Nothing here yet</strong>
        Add funds, then pay someone. Every amount will show up sealed.
      </div>
    );
  }
  return (
    <div className="feed">
      {items.map((item, i) => {
        const meta = rowMeta(item);
        const note = item.kind === "sent" || item.kind === "received" ? noteFor(item.txHash) : undefined;
        const showAmount = item.kind !== "collected" && item.kind !== "joined";
        return (
          <div className="feed-row" key={`${item.txHash}-${i}`}>
            <div className={`feed-glyph${meta.incoming ? " in" : ""}`} aria-hidden>
              {meta.glyph}
            </div>
            <div className="feed-main">
              <div className="feed-title">
                {meta.title}
                {note ? ` — ${note}` : ""}
              </div>
              <div className="feed-sub">
                ledger {item.ledger} ·{" "}
                <a className="txlink" href={`${EXPLORER_TX}${item.txHash}`} target="_blank" rel="noreferrer">
                  {truncateMiddle(item.txHash, 6, 4)}
                </a>
              </div>
            </div>
            {showAmount && (
              <div className="feed-amt">
                <span className={meta.incoming ? "in" : undefined}>
                  <SealedAmount
                    stroops={item.amount}
                    isPublic={item.amountPublic}
                    sign={meta.incoming ? "+" : "−"}
                  />
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
