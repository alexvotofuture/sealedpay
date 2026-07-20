"use client";

import { useEffect, useState } from "react";
import type { PayWallet } from "@/lib/pay";
import { truncateMiddle } from "@/lib/util";
import { listContacts, removeContact, saveContact, type Contact } from "@/lib/contacts";

export function ContactsPanel({
  wallet,
  onPay,
}: {
  wallet: PayWallet;
  onPay: (address: string) => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [discovered, setDiscovered] = useState<string[] | null>(null);

  useEffect(() => setContacts(listContacts()), []);

  function add() {
    if (!name.trim() || !address.trim()) return;
    setContacts(saveContact({ name: name.trim(), address: address.trim() }));
    setName("");
    setAddress("");
  }

  async function discover() {
    setDiscovered(await wallet.knownRecipients());
  }

  const known = new Set(contacts.map((c) => c.address));

  return (
    <div className="card">
      {contacts.length === 0 ? (
        <div className="empty">
          <strong>No contacts yet</strong>
          Names live only in this browser — the chain never sees them.
        </div>
      ) : (
        <div>
          {contacts.map((c) => (
            <div className="contact-row" key={c.address}>
              <div>
                <div className="contact-name">{c.name}</div>
                <div className="contact-addr">{truncateMiddle(c.address, 8, 6)}</div>
              </div>
              <div className="row-actions">
                <button className="link-btn" onClick={() => onPay(c.address)}>
                  Pay
                </button>
                <button
                  className="link-btn danger"
                  onClick={() => setContacts(removeContact(c.address))}
                  aria-label={`Remove ${c.name}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: "1px dashed var(--line)", marginTop: 14, paddingTop: 14 }}>
        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice" />
        </div>
        <div className="field">
          <label htmlFor="c-addr">Stellar address</label>
          <input
            id="c-addr"
            className="mono"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="G…"
            spellCheck={false}
          />
        </div>
        <button className="btn ghost" onClick={add} disabled={!name.trim() || !address.trim()}>
          Save contact
        </button>
      </div>

      <div style={{ borderTop: "1px dashed var(--line)", marginTop: 14, paddingTop: 14 }}>
        <button className="link-btn" onClick={discover}>
          Find recently registered accounts
        </button>
        {discovered && (
          <div style={{ marginTop: 8 }}>
            {discovered.filter((a) => !known.has(a)).length === 0 ? (
              <span className="hint" style={{ fontSize: 12, color: "var(--muted)" }}>
                No new accounts in the recent event window.
              </span>
            ) : (
              discovered
                .filter((a) => !known.has(a))
                .map((a) => (
                  <div className="contact-row" key={a}>
                    <div className="contact-addr">{truncateMiddle(a, 10, 8)}</div>
                    <div className="row-actions">
                      <button className="link-btn" onClick={() => onPay(a)}>
                        Pay
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
