import "dotenv/config";
import { createPrivateKey, createPublicKey } from "node:crypto";

const appId = process.env.PRIVY_APP_ID!;
const appSecret = process.env.PRIVY_APP_SECRET!;
const policyId = process.env.PRIVY_CEILING_POLICY_ID!;
const quorumId = process.env.PRIVY_KEY_QUORUM_ID!;
const authKeys = [process.env.PRIVY_AUTH_KEY_1, process.env.PRIVY_AUTH_KEY_2].filter(Boolean) as string[];

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    "privy-app-id": appId,
  };
}

function derivePublicKeyBase64(privateKeyBase64: string): string {
  const der = Buffer.from(privateKeyBase64, "base64");
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

async function main() {
  if (!appId || !appSecret) throw new Error("PRIVY_APP_ID / PRIVY_APP_SECRET missing");
  if (!policyId) throw new Error("PRIVY_CEILING_POLICY_ID missing");
  if (!quorumId) throw new Error("PRIVY_KEY_QUORUM_ID missing");
  if (authKeys.length === 0) throw new Error("PRIVY_AUTH_KEY_1 / PRIVY_AUTH_KEY_2 missing");

  console.log("Local keys -> derived public keys (base64 SPKI DER):");
  authKeys.forEach((k, i) => console.log(`  key ${i + 1}: ${derivePublicKeyBase64(k)}`));

  const policyRes = await fetch(`https://api.privy.io/v1/policies/${policyId}`, { headers: authHeaders() });
  const policy = await policyRes.json();
  console.log(`\nPolicy ${policyId}:`);
  console.log(`  owner_id: ${policy.owner_id ?? "(none -- policy has no quorum owner!)"}`);
  console.log(`  expected: ${quorumId}`);
  console.log(`  MATCH: ${policy.owner_id === quorumId}`);

  const quorumRes = await fetch(`https://api.privy.io/v1/key_quorums/${quorumId}`, { headers: authHeaders() });
  const quorum = await quorumRes.json();
  console.log(`\nQuorum ${quorumId}:`);
  console.log(`  authorization_threshold: ${quorum.authorization_threshold}`);
  console.log(`  members:`);
  for (const m of quorum.public_keys ?? quorum.members ?? []) {
    console.log(`    ${JSON.stringify(m)}`);
  }
  console.log(
    "\nCompare each 'derived public key' above against the quorum members list. " +
      "If none match, these keys were not the ones registered to this quorum -- " +
      "regenerate the quorum from these exact keys, or find the keys that were " +
      "actually used when the quorum was created."
  );
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});