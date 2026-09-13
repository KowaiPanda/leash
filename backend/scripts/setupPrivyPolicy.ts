import "dotenv/config";
import { createCeilingPolicy } from "../src/services/privyService.js";

const quorumId = process.env.PRIVY_KEY_QUORUM_ID;
if (!quorumId) {
  console.error("Set PRIVY_KEY_QUORUM_ID in backend/.env first.");
  process.exit(1);
}

const INITIAL_CEILING_USDC = 2.0;

createCeilingPolicy(quorumId, INITIAL_CEILING_USDC)
  .then((policyId) => {
    console.log("\n==============================================");
    console.log(`  Created ceiling policy: ${policyId}`);
    console.log(`  Paste this into backend/.env as PRIVY_CEILING_POLICY_ID`);
    console.log("==============================================\n");
  })
  .catch((err) => {
    console.error("Error:", err.message || err);
    process.exit(1);
  });