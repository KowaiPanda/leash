import { config } from "../config.js";

// Leash is its own x402 facilitator-PROXY. It never asks Blocky402 to
// enforce anything about mandates — Blocky402 only ever sees payments Leash
// has already approved via mandateService.evaluateMandate().

type VerifyRequest = {
  paymentPayload: unknown;
  paymentRequirements: unknown;
};

export async function verifyPayment(body: VerifyRequest) {
  const res = await fetch(`${config.blocky402.baseUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Blocky402 /verify failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ isValid: boolean; invalidReason?: string }>;
  // return {isValid: true, invalidReason: ""};
}

export async function settlePayment(body: VerifyRequest) {
  const res = await fetch(`${config.blocky402.baseUrl}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Blocky402 /settle failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ success: boolean; transaction?: string; network?: string }>;
  // return {success:true, transaction:"stub"};
}

//Builds the x402 PaymentRequirements object the resource server returns in its 402 response.
export function buildPaymentRequirements(resourcePath: string, priceUsdc: number) {
  return {
    scheme: "exact",
    network: config.blocky402.network,
    asset: process.env.RESOURCE_ASSET_ID ?? "USDC",
    amount: Math.round(priceUsdc * 1_000_000).toString(),
    payTo: process.env.RESOURCE_PAYEE_ADDRESS ?? "0.0.0000",
    maxTimeoutSeconds: 60,
    extra: { feePayer: process.env.BLOCKY402_FEE_PAYER ?? "0.0.7162784" },
  };
}