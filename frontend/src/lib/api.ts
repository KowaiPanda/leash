const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export type Mandate = {
  id: string;
  agentId: string;
  issuerUserId: string;
  scope: string[];
  ceiling: number;
  spent: number;
  rateLimit: { maxAmount: number; windowSeconds: number };
  expiresAt: string;
  revoked: boolean;
  hcsIssuanceSeq: number | null;
  createdAt: string;
  pendingCeilingRaise?: { intentId: string; newCeiling: number } | null;
};

export type MandateEvent = {
  id: string;
  mandateId: string;
  agentId?: string;
  type: string;
  amount?: number;
  reason?: string;
  hcsSeq: number | null;
  hcsConsensusTimestamp: string | null;
  txHash?: string;
  createdAt: string;
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body?.reason ?? body?.error ?? res.statusText);
  return body as T;
}

export const api = {
  listMandates: () => fetch(`${API_BASE}/api/mandates`).then((r) => json<Mandate[]>(r)),

  getMandate: (id: string) =>
    fetch(`${API_BASE}/api/mandates/${id}`).then((r) => json<{ mandate: Mandate; events: MandateEvent[] }>(r)),

  createMandate: (input: {
    agentId: string;
    issuerUserId: string;
    scope: string[];
    ceiling: number;
    rateLimit: { maxAmount: number; windowSeconds: number };
    expiresAt: string;
  }) =>
    fetch(`${API_BASE}/api/mandates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<Mandate>(r)),

  revokeMandate: (id: string) =>
    fetch(`${API_BASE}/api/mandates/${id}/revoke`, { method: "POST" }).then((r) => json<Mandate>(r)),

  raiseCeiling: (id: string, newCeiling: number) =>
    fetch(`${API_BASE}/api/mandates/${id}/raise-ceiling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newCeiling }),
    }).then((r) => json<Mandate>(r)),

  checkCeilingRaise: (id: string) =>
    fetch(`${API_BASE}/api/mandates/${id}/check-ceiling-raise`, { method: "POST" }).then((r) =>
      json<{ intentStatus: string; mandate: Mandate }>(r)
    ),

  rails: () =>
    fetch(`${API_BASE}/api/pay/rails`).then((r) =>
      json<{ hedera: { live: boolean; network: string }; arc: { live: boolean; network: string } }>(r)
    ),

  pay: (mandateId: string, amount: number, rail: "hedera" | "arc") =>
    fetch(`${API_BASE}/api/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mandate-Id": mandateId,
        "X-Payment-Amount": amount.toString(),
      },
      body: JSON.stringify({ rail }),
    }).then((r) => json<any>(r)),

  mirrorUrl: () => fetch(`${API_BASE}/api/audit/mirror-url`).then((r) => json<{ url: string }>(r)),

  allEvents: () => fetch(`${API_BASE}/api/audit/events`).then((r) => json<MandateEvent[]>(r)),
};