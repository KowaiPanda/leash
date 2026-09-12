import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// One-time setup script. Creates ONE wallet set holding TWO Arc Testnet
// wallets: one for "the agent" (the payer whose spend is bounded by a
// mandate) and one for "the resource server" (the payee that receives
// settlement).

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error(
    "Missing CIRCLE_API_KEY and/or CIRCLE_ENTITY_SECRET in backend/.env.\n" +
      "Get an API key at https://console.circle.com and register an Entity Secret first:\n" +
      "https://developers.circle.com/wallets/dev-controlled/entity-secret-management"
  );
  process.exit(1);
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

async function main() {
  console.log("Creating wallet set...");
  const walletSetResponse = await client.createWalletSet({
    name: "Leash Arc Wallets",
  });
  const walletSet = walletSetResponse.data?.walletSet;
  if (!walletSet?.id) {
    throw new Error("Wallet set creation failed: no ID returned");
  }
  console.log(`Wallet set created: ${walletSet.id}`);

  console.log("Creating agent + payee wallets on ARC-TESTNET...");
  const walletResponse = await client.createWallets({
    walletSetId: walletSet.id,
    blockchains: ["ARC-TESTNET"],
    count: 2, // [0] = agent (payer), [1] = payee (resource server)
    accountType: "EOA",
  });

  const wallets = walletResponse.data?.wallets ?? [];
  if (wallets.length < 2) {
    throw new Error(`Expected 2 wallets, got ${wallets.length}. Raw response: ${JSON.stringify(walletResponse.data)}`);
  }

  const [agentWallet, payeeWallet] = wallets;

  console.log("\n==============================================");
  console.log("  Paste these into backend/.env :");
  console.log("==============================================");
  console.log(`ARC_AGENT_WALLET_ID=${agentWallet?.id}`);
  console.log(`ARC_PAYEE_ADDRESS=${payeeWallet?.address}`);
  console.log("==============================================");
  console.log(`\n(For reference — payee's own wallet id, not needed in .env: ${payeeWallet?.id})`);
  console.log(`Agent wallet address (fund THIS one with testnet USDC): ${agentWallet?.address}`);
  console.log("\nNext step: fund the agent wallet with testnet USDC at https://faucet.circle.com");
  console.log("(select Arc Testnet, paste the agent wallet address above).");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});