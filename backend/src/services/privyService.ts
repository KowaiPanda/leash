import { config } from "../config.js";

// Server-side calls to Privy's REST API. Requests are authenticated with
// HTTP Basic auth using your app id + app secret 

function authHeader(): string {
  const token = Buffer.from(`${config.privy.appId}:${config.privy.appSecret}`).toString("base64");
  return `Basic ${token}`;
}

async function privyFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.privy.io${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "privy-app-id": config.privy.appId,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Privy API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Canonical, deterministic string for a mandate's terms. This is what the
 * issuer's Privy wallet signs at issuance time, and what gets hashed into
 * the HCS ISSUED event, so the mandate's terms can't be altered after the
 * fact without the signature failing to verify.
 */
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


// Signs the mandate payload using a Privy server wallet 
export async function signMandate(walletId: string, payload: string) {
  return privyFetch(`/v1/wallets/${walletId}/raw_sign`, {
    method: "POST",
    body: JSON.stringify({
      params: { hash: `0x${Buffer.from(payload).toString("hex")}` },
    }),
  });
}

/**
 * Creates an intent to update a policy/wallet that is owned by the app's
 * key quorum. Because the resource is quorum-owned, this call does not
 * execute immediately — it sits pending until enough quorum members approve
 * it from the Privy Dashboard.
 */
export async function proposeCeilingRaiseIntent(policyId: string, newRule: unknown) {
  return privyFetch(`/v1/policies/${policyId}`, {
    method: "PATCH",
    body: JSON.stringify({ rules: [newRule] }),
    headers: { "privy-authorization-signature": "" }, // omitted -> becomes an async intent, not a synchronous call
  });
}

export async function getIntentStatus(intentId: string) {
  return privyFetch(`/v1/intents/${intentId}`);
}