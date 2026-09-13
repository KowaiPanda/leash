export type Mandate = {
  id: string;
  agentId: string;
  issuerUserId: string;
  scope: string[];
  ceiling: number; // USDC, decimal (e.g. 2.00)
  spent: number;
  rateLimit: {
    maxAmount: number;
    windowSeconds: number;
  };
  expiresAt: string; // ISO
  revoked: boolean;
  quorumRequiredAboveCeiling: boolean;
  issuerSignature: string;
  hcsIssuanceSeq: number | null;
  createdAt: string;
  pendingCeilingRaise?: { intentId: string; newCeiling: number } | null;
};

export type MandateEventType =
  | "ISSUED"
  | "DECREMENT"
  | "REJECTED"
  | "CEILING_RAISE_PROPOSED"
  | "CEILING_RAISE_EXECUTED"
  | "REVOKED";

export type MandateEvent = {
  id: string;
  mandateId: string;
  type: MandateEventType;
  amount?: number;
  remaining?: number;
  reason?: string;
  hcsSeq: number | null;
  hcsConsensusTimestamp: string | null;
  txHash?: string;
  createdAt: string;
};

export type GuardDecision =
  | { allowed: true }
  | { allowed: false; reason: string };