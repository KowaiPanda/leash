import { v4 as uuid } from "uuid";
import fs from "node:fs";
import path from "node:path";
import type { Mandate, MandateEvent, GuardDecision } from "../types.js";

const SNAPSHOT_PATH = path.resolve(process.cwd(), ".data-snapshot.json");

const mandates = new Map<string, Mandate>();
const events = new Map<string, MandateEvent[]>(); // mandateId -> events

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
    for (const m of raw.mandates ?? []) mandates.set(m.id, m);
    for (const [id, evs] of Object.entries(raw.events ?? {})) {
      events.set(id, evs as MandateEvent[]);
    }
  } catch (e) {
    console.warn("[mandateService] failed to load snapshot", e);
  }
}

function saveSnapshot() {
  const data = {
    mandates: Array.from(mandates.values()),
    events: Object.fromEntries(events.entries()),
  };
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
}

loadSnapshot();

export function createMandate(
  input: Pick<
    Mandate,
    "agentId" | "issuerUserId" | "scope" | "ceiling" | "rateLimit" | "expiresAt" | "issuerSignature"
  >
): Mandate {
  const mandate: Mandate = {
    id: uuid(),
    ...input,
    spent: 0,
    revoked: false,
    quorumRequiredAboveCeiling: true,
    hcsIssuanceSeq: null,
    createdAt: new Date().toISOString(),
  };
  mandates.set(mandate.id, mandate);
  events.set(mandate.id, []);
  saveSnapshot();
  return mandate;
}

export function getMandate(id: string): Mandate | undefined {
  return mandates.get(id);
}

export function listMandates(): Mandate[] {
  return Array.from(mandates.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listEvents(mandateId: string): MandateEvent[] {
  return events.get(mandateId) ?? [];
}

export function appendEvent(evt: Omit<MandateEvent, "id" | "createdAt">): MandateEvent {
  const full: MandateEvent = { ...evt, id: uuid(), createdAt: new Date().toISOString() };
  const list = events.get(evt.mandateId) ?? [];
  list.push(full);
  events.set(evt.mandateId, list);
  saveSnapshot();
  return full;
}

export function setIssuanceSeq(mandateId: string, seq: number) {
  const m = mandates.get(mandateId);
  if (!m) return;
  m.hcsIssuanceSeq = seq;
  saveSnapshot();
}

export function revokeMandate(mandateId: string) {
  const m = mandates.get(mandateId);
  if (!m) return;
  m.revoked = true;
  saveSnapshot();
}

export function raiseCeiling(mandateId: string, newCeiling: number) {
  const m = mandates.get(mandateId);
  if (!m) return;
  m.ceiling = newCeiling;
  saveSnapshot();
}

export function setPendingCeilingRaise(mandateId: string, intentId: string, newCeiling: number) {
  const m = mandates.get(mandateId);
  if (!m) return;
  m.pendingCeilingRaise = { intentId, newCeiling };
  saveSnapshot();
}

export function clearPendingCeilingRaise(mandateId: string) {
  const m = mandates.get(mandateId);
  if (!m) return;
  m.pendingCeilingRaise = null;
  saveSnapshot();
}

/**
 * The whole point of Leash. Given a mandate id, the resource being paid for,
 * and the amount, decide whether this payment may proceed *before* it is
 * ever forwarded to the facilitator for settlement.
 */
export function evaluateMandate(
  mandateId: string,
  resource: string,
  amount: number
): GuardDecision {
  const mandate = mandates.get(mandateId);
  if (!mandate) return { allowed: false, reason: "mandate not found" };
  if (mandate.revoked) return { allowed: false, reason: "mandate revoked" };
  if (new Date(mandate.expiresAt).getTime() < Date.now()) {
    return { allowed: false, reason: "mandate expired" };
  }
  if (!mandate.scope.includes(resource)) {
    return { allowed: false, reason: `resource '${resource}' not in mandate scope` };
  }
  if (mandate.spent + amount > mandate.ceiling) {
    return {
      allowed: false,
      reason: `payment of ${amount} would exceed remaining ceiling (${(mandate.ceiling - mandate.spent).toFixed(4)} left)`,
    };
  }

  const windowStart = Date.now() - mandate.rateLimit.windowSeconds * 1000;
  const recentSpend = (events.get(mandateId) ?? [])
    .filter((e) => e.type === "DECREMENT" && new Date(e.createdAt).getTime() >= windowStart)
    .reduce((sum, e) => sum + (e.amount ?? 0), 0);
  if (recentSpend + amount > mandate.rateLimit.maxAmount) {
    return {
      allowed: false,
      reason: `payment would exceed rate limit (${mandate.rateLimit.maxAmount} per ${mandate.rateLimit.windowSeconds}s window; ${recentSpend.toFixed(4)} already spent in this window)`,
    };
  }

  return { allowed: true };
}

export function recordDecrement(mandateId: string, amount: number) {
  const m = mandates.get(mandateId);
  if (!m) return;
  m.spent += amount;
  saveSnapshot();
}