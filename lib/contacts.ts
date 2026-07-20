/**
 * Contacts and payment notes. Both live ONLY in localStorage:
 *
 *  - Contacts map a Stellar address to a display name. Addresses are public
 *    on-chain by design (confidential tokens hide amounts, not counterparties),
 *    but names are yours alone.
 *  - Notes ("dinner 🍜") are attached to a tx hash locally after a payment
 *    settles. The protocol has no on-chain memo for confidential transfers —
 *    a plaintext memo would leak exactly what the commitments hide — so notes
 *    never leave this device.
 */

const CONTACTS_KEY = "pay:contacts";
const NOTES_KEY = "pay:notes";

export interface Contact {
  address: string;
  name: string;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — degrade silently */
  }
}

export function listContacts(): Contact[] {
  return read<Contact[]>(CONTACTS_KEY, []);
}

export function saveContact(contact: Contact): Contact[] {
  const next = listContacts().filter((c) => c.address !== contact.address);
  next.unshift(contact);
  write(CONTACTS_KEY, next);
  return next;
}

export function removeContact(address: string): Contact[] {
  const next = listContacts().filter((c) => c.address !== address);
  write(CONTACTS_KEY, next);
  return next;
}

export function contactName(address: string): string | undefined {
  return listContacts().find((c) => c.address === address)?.name;
}

// ------------------------------------------------------------------ notes ----

export function noteFor(txHash: string): string | undefined {
  return read<Record<string, string>>(NOTES_KEY, {})[txHash];
}

export function saveNote(txHash: string, note: string): void {
  if (!note.trim()) return;
  const all = read<Record<string, string>>(NOTES_KEY, {});
  all[txHash] = note.trim();
  write(NOTES_KEY, all);
}
