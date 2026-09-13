import { PrivyClient, generateAuthorizationSignature  } from "@privy-io/node";
import { config } from "../config.js";

// Server-side Privy integration. Two distinct pieces:
//   1. Mandate issuance signing.
//   2. The ceiling-raise quorum flow: a quorum-owned Ethereum POLICY stands
//      in for "the mandate's ceiling." Privy policies gate real wallet
//      transaction methods (eth_sendTransaction, transfer, etc.) scoped to
//      a chain_type — there is no generic arbitrary-field policy type. We
//      mirror the mandate's ceiling into a real, quorum-owned policy rule's
//      numeric value purely so that CHANGING that number requires genuine
//      N-of-M human approval through Privy's own intents/quorum system.
//      Nothing here gates a real on-chain transfer.

let client: PrivyClient | null = null;
function getClient(): PrivyClient {
  if (client) return client;
  if (!config.privy.appId || !config.privy.appSecret) {
    throw new Error("PRIVY_APP_ID / PRIVY_APP_SECRET missing — see backend/.env");
  }
  client = new PrivyClient({ appId: config.privy.appId, appSecret: config.privy.appSecret });
  return client;
}

export function canonicalMandatePayload(input: {
  agentId: string;
  scope: string[];
  ceiling: number;
  rateLimit: { maxAmount: number; windowSeconds: number };
  expiresAt: string;
}): string {
  return JSON.stringify({
    agentId: input.agentId,
    scope: [...input.scope].sort(),
    ceiling: input.ceiling,
    rateLimit: input.rateLimit,
    expiresAt: input.expiresAt,
  });
}

function ceilingToRuleValue(usdc: number): string {
  return Math.round(usdc * 1_000_000).toString();
}

function ceilingRule(usdc: number) {
  return {
    name: "Current mandate ceiling",
    method: "eth_sendTransaction",
    action: "ALLOW",
    conditions: [
      {
        field_source: "ethereum_transaction",
        field: "value",
        operator: "lte",
        value: ceilingToRuleValue(usdc),
      },
    ],
  };
}

export async function createCeilingPolicy(quorumId: string, initialCeilingUsdc: number) {
  const c = getClient();
  const policy = await c.policies().create({
    version: "1.0",
    name: "Leash mandate ceiling",
    chain_type: "ethereum",
    rules: [ceilingRule(initialCeilingUsdc)],
    owner_id: quorumId,
  });
  return policy.id;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${config.privy.appId}:${config.privy.appSecret}`).toString("base64")}`,
    "privy-app-id": config.privy.appId,
  };
}

export async function raiseCeilingWithSignatures(
  policyId: string,
  newCeilingUsdc: number,
  authorizationPrivateKeys: string[]
) {
  const rawBody = { rules: [ceilingRule(newCeilingUsdc)] };
  const body = JSON.parse(JSON.stringify(rawBody));
  
  const url = `https://api.privy.io/v1/policies/${policyId}`;
  const method = "PATCH";
  const privyHeaders = { "privy-app-id": config.privy.appId };
  const input = { version: 1 as const, url, method: "PATCH" as const, headers: privyHeaders, body };
 
  const rawSignatures = await Promise.all(
    authorizationPrivateKeys.map((authorizationPrivateKey) =>
      generateAuthorizationSignature({ authorizationPrivateKey, input })
    )
  );
  
  const signatures = rawSignatures.map((s: any) => {
    if (typeof s === "string") return s;
    if (s && typeof s === "object" && "signature" in s) return s.signature;
    if (Array.isArray(s)) return s[0];
    return String(s);
  });
 
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
      "privy-authorization-signature": signatures.join(","),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Privy policy update failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Legacy: async intents endpoint, kept for reference only. Requires
// Dashboard Approvals enabled (Privy support gate) — use raiseCeilingWithSignatures() 
// above instead, which does not need it. ---
export async function proposeCeilingRaiseIntent(policyId: string, newCeilingUsdc: number) {
  const res = await fetch(`https://api.privy.io/v1/apps/${config.privy.appId}/intents/policies/${policyId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ rules: [ceilingRule(newCeilingUsdc)] }),
  });
  if (!res.ok) throw new Error(`Privy intent creation failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; status: string }>;
}

export async function getIntentStatus(intentId: string) {
  const res = await fetch(`https://api.privy.io/v1/apps/${config.privy.appId}/intents/${intentId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Privy get intent failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; status: "pending" | "authorized" | "executed" | "rejected" }>;
}