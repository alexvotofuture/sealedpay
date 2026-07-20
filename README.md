# Sealed — confidential P2P payments on Stellar

A peer-to-peer payment app built on **OpenZeppelin's Confidential Token**
developer preview for Stellar (contract suite by OpenZeppelin, on-chain
UltraHonk verifier by Nethermind). Balances and payment amounts live on-chain
only as Pedersen commitments; every state change carries a zero-knowledge
proof, generated **in the browser** — your spending secrets never leave the
device. Counterparty addresses stay public by design: confidential, not
anonymous.

> ⚠️ **Developer preview, testnet only.** The circuits and the UltraHonk
> verifier backend are unaudited. Never use this with real value.

## What the app does

| You see | The chain sees |
| --- | --- |
| "Paid Alice 25 XLM — dinner 🍜" | `confidential_transfer(you, alice, <commitments + proof>)` |
| Your spendable + pending balance | Two Pedersen commitments |
| Notes and contact names | Nothing (both are localStorage-only) |

Features:

- **Onboarding** — connect Freighter, sign one message to deterministically
  derive your confidential key (recoverable on any device), create your sealed
  account (`register`, one in-browser proof).
- **Add funds / withdraw** — wrap public XLM into the confidential balance
  (`deposit`) and unwrap it (`withdraw`). These two amounts are public
  on-chain by protocol design, and the UI says so.
- **Pay sealed** — `send()` is one intent: if your spendable balance can't
  cover it but spendable + pending can, the app merges first, then proves and
  submits the `confidential_transfer`.
- **Pending + Collect** — incoming money lands in the protocol's receiving
  balance; **Collect** runs `merge` (a homomorphic point-add, no proof).
- **Activity** — payment-shaped feed reconstructed from chain events, with
  amounts decrypted locally (your viewing key for inbound; deterministic
  ephemeral-scalar recovery for outbound). Undecryptable amounts honestly
  render as `sealed`.
- **Requests** — shareable `/?to=G…&amount=…&note=…` links that pre-fill the
  send form.
- **Sealed-by-default UI** — every amount renders masked and unseals on tap;
  the eye on the balance card breaks or restores all seals for the session.

## How it plugs in

This package is designed to drop into the official demo workspace
([brozorec/stellar-confidential-token-demo](https://github.com/brozorec/stellar-confidential-token-demo)),
which provides `@ctd/sdk` (crypto, witnesses, bb.js proving, chain client,
state engine) and the deployed testnet contract suite. This app adds no new
contracts — it targets the canonical preview deployment:

| Contract | ID |
| --- | --- |
| token | `CBF64DEOVQAXJFBSNGFEUT2AH4H7K5JBY3ZYJ5GVEINMNSDISWRG5N3F` |
| verifier | `CDCET36PIS44DWJM5UQSSI4ZHGRDSBIIQW4G4ALPYK3Y6FEQGY5ZWFXL` |
| auditor | `CA4II62E35TQKPGHCPBD6EBAS732GSGS6H37UUWKEDHR4YTBVMPHVY4L` |
| underlying | native XLM SAC `CDLZ…CYSC` |

The key-derivation message is byte-identical to the demo's, so the same
Freighter account resolves to the same confidential account in both apps.

## Setup

```bash
# 1. Clone the upstream demo workspace
git clone https://github.com/brozorec/stellar-confidential-token-demo
cd stellar-confidential-token-demo

# 2. Drop this package in
cp -r /path/to/pay packages/pay

# 3. Install + build the SDK (Node ≥ 20, pnpm 10)
pnpm install
pnpm build:sdk

# 4. Run (predev vendors bb.js into public/vendor/bb automatically)
pnpm --filter @ctd/pay dev     # http://localhost:3001
```

Then in the browser:

1. Install [Freighter](https://freighter.app/), switch it to **Testnet**.
2. Fund your account with test XLM at [Stellar Lab](https://lab.stellar.org/)
   ("Fund account").
3. Connect → sign the derivation message → **Create sealed account** →
   **Add funds** → **Collect** → pay someone. The recipient must have created
   an account too (open the app with a second Freighter account, or use the
   upstream demo's wallet page — same token, same accounts).

Optional: set `NEXT_PUBLIC_INDEXER_URL` (see the workspace's
`packages/indexer/`) to backfill history older than the RPC retention window.

## Architecture

```
lib/deployment.ts     the one testnet deployment (token/verifier/auditor ids)
lib/wallet-adapter.ts Freighter Signer + deterministic sk derivation
lib/bb-loader.ts      loads bb.js as native ESM (webpack must not bundle it)
lib/pay.ts            PayWallet: register/addFunds/collect/send/withdraw,
                      activity feed with local amount decryption
lib/contacts.ts       localStorage contacts + per-tx notes (never on-chain)
lib/util.ts           errors, stroops⇄XLM, RPC client construction
app/                  Next.js UI (sealed-amount chips, send/request, feed)
```

Flow of a payment: `PayWallet.send()` → sync local state from chain events →
(auto-`merge` if needed) → build the transfer witness (`@ctd/sdk`) → prove
with UltraHonk in a Web Worker (bb.js, keccak transcript) → submit
`confidential_transfer(from, to, {payload, proof})` via Freighter → the
on-chain verifier checks the proof → balances update as new commitments.

## Things to know (protocol realities, surfaced honestly in the UI)

- **Deposit/withdraw amounts are public.** Only balances and transfer amounts
  are sealed. Entering/exiting the wrapper is visible — batch or round your
  deposits if that matters to you.
- **Addresses are public.** Who paid whom is on-chain; how much is not. For
  hiding counterparties too, look at privacy pools (e.g. Stellar Private
  Payments) instead.
- **Auditor channel.** Every transfer emits dual auditor ciphertexts; the
  registered auditor key can decrypt amounts. That's a feature of this
  compliance-oriented design, not a bug.
- **Notes/memos can't go on-chain.** A plaintext memo would leak what the
  commitments hide, and the protocol has no encrypted-memo lane; notes stay in
  localStorage.
- **~7-day event retention (RPC-only mode).** Spendable secrets live in
  events. The state engine persists decrypted openings locally and can
  recover your spendable balance from the latest event, but an *incoming*
  transfer whose event ages out before you sync loses its opening. Sync at
  least weekly, or configure the indexer. `verifyAgainstChain()` runs on every
  refresh so divergence is detected, never silently spent.
- **Proving takes seconds.** UltraHonk in-browser is ~10–30 s per proof
  depending on hardware; the UI shows the phase. Cross-origin isolation
  (COOP/COEP headers in `next.config.mjs`) is required for the wasm threads.

## Extending

- **Payment receipts** — the protocol supports off-chain selective disclosure
  (prove "this transfer paid exactly X" to one designated party). The SDK's
  `disclosure` module + the upstream demo's `/verify` page show the full
  prove/verify protocol; wiring a "Prove this payment" button onto feed rows
  is the natural next feature.
- **A different underlying** — deploy your own wrapper over USDC or any SEP-41
  token via the workspace's factory (`scripts/deploy.ts`), then point
  `lib/deployment.ts` at it. Note `lib/util.ts` assumes 7 decimals.
- **Compliance** — the OpenZeppelin suite ships freeze, SAC passthrough, and
  allow/block-list policy hooks; see its COMPLIANCE.md.

## Credits & license

Built on [OpenZeppelin stellar-contracts](https://github.com/OpenZeppelin/stellar-contracts)
(`feat/confidential-verifier-ultrahonk`), Nethermind's UltraHonk verifier, and
the official demo workspace, whose MIT-licensed SDK and integration plumbing
(Freighter adapter, key derivation, bb.js loading) this app adapts. MIT.
