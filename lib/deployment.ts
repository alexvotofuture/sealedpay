/**
 * The one deployment this app serves: the canonical vanilla Confidential Token
 * from the OpenZeppelin developer preview, wrapping native XLM (via its SAC)
 * on Stellar TESTNET.
 *
 * These ids come from the upstream demo's deployments/testnet.json. If you
 * redeploy your own suite (pnpm deploy:contracts at the workspace root), paste
 * the new ids + deploy ledger here. Keys are token-bound, so a new token means
 * fresh confidential accounts for everyone.
 *
 * ⚠️ Developer preview, testnet only. The circuits and verifier are unaudited —
 * never wire this at real value.
 */
import { Networks } from "@stellar/stellar-sdk";

export interface Deployment {
  label: string;
  rpcUrl: string;
  networkPassphrase: string;
  /** Optional Goldsky indexer for history older than the RPC ~7-day window. */
  indexerUrl?: string;
  /** Ledger the token was deployed at — first-sync start point. */
  deployedAtLedger: number;
  /** Auditor id every account in this app registers under. */
  auditorId: number;
  contracts: {
    token: string;
    verifier: string;
    auditor: string;
    underlying: string;
  };
}

export const DEPLOYMENT: Deployment = {
  label: "Confidential XLM (testnet preview)",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL || undefined,
  deployedAtLedger: 3013364,
  auditorId: 0,
  contracts: {
    token: "CBF64DEOVQAXJFBSNGFEUT2AH4H7K5JBY3ZYJ5GVEINMNSDISWRG5N3F",
    verifier: "CDCET36PIS44DWJM5UQSSI4ZHGRDSBIIQW4G4ALPYK3Y6FEQGY5ZWFXL",
    auditor: "CA4II62E35TQKPGHCPBD6EBAS732GSGS6H37UUWKEDHR4YTBVMPHVY4L",
    underlying: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
};
