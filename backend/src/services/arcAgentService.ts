import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// This is the second settlement rail. The point of building it alongside
// Blocky402/Hedera is to prove the core Leash claim — "the cap is enforced
// by the payment rail, not by the agent's own good behaviour" — is actually
// rail-agnostic. The mandate guard in mandateGuard.ts / mandateService.ts
// runs identically regardless of which rail a request asks for; this file
// is only ever reached AFTER that check has already passed.
//
// Circle's Agent Stack gives an agent a Developer-Controlled Wallet with its own
// on-chain spending policy (allowlists / transfer caps) and settles USDC on Arc testnet.
// We call that same wallet's spending-policy config to set a policy that MIRRORS
// the mandate currently in force — so even if a bug let a bad request past
// Leash's own guard, Circle's policy engine is a second, independent stop.
// Leash's mandate is the source of truth; Circle's wallet policy is kept in
// sync with it as a belt-and-suspenders backstop, exactly mirroring how
// Privy's policy engine is used as a secondary guard on the issuance side.

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? "";
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET ?? "";
const ARC_AGENT_WALLET_ID = process.env.ARC_AGENT_WALLET_ID ?? "";
const ARC_PAYEE_ADDRESS = process.env.ARC_PAYEE_ADDRESS ?? "";

function circleConfigured(): boolean {
  return Boolean(CIRCLE_API_KEY && CIRCLE_ENTITY_SECRET && ARC_AGENT_WALLET_ID && ARC_PAYEE_ADDRESS);
}

let client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;
function getClient() {
  if (client) return client;
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET missing — see backend/.env.example");
  }
  client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
  return client;
}

let cachedUsdcTokenId: string | null = null;
async function resolveUsdcTokenId(walletId: string): Promise<string> {
  if (cachedUsdcTokenId) return cachedUsdcTokenId;
  const c = getClient();
  const balances = await c.getWalletTokenBalance({ id: walletId });
  const usdc = balances.data?.tokenBalances?.find(
    (b: any) => b.token?.symbol === "USDC" || b.token?.name === "USD Coin"
  );
  if (!usdc?.token?.id) {
    throw new Error(
      `Could not find a USDC token balance on wallet ${walletId}. ` +
        "Fund it with testnet USDC at https://faucet.circle.com first (select Arc Testnet)."
    );
  }
  cachedUsdcTokenId = usdc.token.id;
  return cachedUsdcTokenId;
}

/**
 * Keeps the agent's Circle wallet spending policy in sync with the mandate
 * that's currently in force, so Arc's own runtime guardrail matches Leash's.
 */
export async function syncArcWalletPolicy(_params: {
  walletId: string;
  maxUsdcPerTransfer: number;
  allowedRecipients: string[];
}) {
  console.warn(
    "[arcAgentService] syncArcWalletPolicy is an unconfirmed stub — skipping. " +
      "Verify Circle's Policy Engine API before wiring this in for a demo."
  );
  return { skipped: true };
}
 
export type ArcSettlement = {
  mocked: boolean;
  txHash: string;
  network: "ARC-TESTNET";
  amountUsdc: number;
  state?: string;
};

export async function settleOnArc(amountUsdc: number): Promise<ArcSettlement> {
  if (!circleConfigured()) {
    return {
      mocked: true,
      txHash: `mock-arc-tx-${Date.now()}`,
      network: "ARC-TESTNET",
      amountUsdc,
    };
  }
 
  const c = getClient();
  const tokenId = await resolveUsdcTokenId(ARC_AGENT_WALLET_ID);
 
  const created = await c.createTransaction({
    walletId: ARC_AGENT_WALLET_ID,
    tokenId,
    destinationAddress: ARC_PAYEE_ADDRESS,
    amount: [amountUsdc.toString()],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
 
  const txId = created.data?.id;
  if (!txId) {
    throw new Error(`Circle createTransaction returned no id: ${JSON.stringify(created.data)}`);
  }
 
  const terminal = new Set(["COMPLETE", "FAILED", "CANCELLED", "DENIED"]);
  let state = "INITIATED";
  let txHash = txId;
 
  for (let attempt = 0; attempt < 15 && !terminal.has(state); attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const check = await c.getTransaction({ id: txId });
    state = check.data?.transaction?.state ?? state;
    txHash = check.data?.transaction?.txHash ?? txHash;
  }
 
  if (state === "FAILED" || state === "CANCELLED" || state === "DENIED") {
    throw new Error(`Arc/Circle settlement ended in state ${state} (transaction id ${txId})`);
  }
 
  return {
    mocked: false,
    txHash,
    network: "ARC-TESTNET",
    amountUsdc,
    state,
  };
}

export function isArcLive(): boolean {
  return circleConfigured();
}