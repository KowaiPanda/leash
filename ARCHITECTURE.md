# Leash — Architecture

## 1. The core object: a Mandate

A Mandate is the thing that makes "give an agent a bounded budget" enforceable
instead of a promise. It is issued by a human (via Privy), lives in Leash's
database, is anchored on Hedera Consensus Service (HCS), and is checked by
Leash's facilitator-proxy on every payment attempt.

```ts
type Mandate = {
  id: string;                 // uuid, also the HCS-anchored mandate id
  agentId: string;            // which agent this mandate authorizes (currently one
                               // demo agent, with a separate settlement identity per
                               // rail -- see §3.5)
  issuerUserId: string;       // Privy user id of the human who issued it
  scope: string[];            // resource URLs / service ids this mandate may pay for
  ceiling: number;            // total lifetime budget, in USDC (decimal, e.g. 2.00)
  spent: number;              // running total already settled
  rateLimit: {
    maxAmount: number;        // max spend per window
    windowSeconds: number;    // e.g. 3600 = per hour
  };
  expiresAt: string;          // ISO date; mandate is dead after this
  revoked: boolean;
  issuerSignature: string;    // signature over the canonical mandate payload
  hcsIssuanceSeq: number | null; // HCS sequence number of the issuance message
  createdAt: string;
};

type MandateEvent = {
  mandateId: string;
  agentId?: string;           // enriched in when read via the /api/audit/events feed
  type: "ISSUED" | "DECREMENT" | "REJECTED" | "CEILING_RAISE_PROPOSED"
      | "CEILING_RAISE_EXECUTED" | "REVOKED";
  amount?: number;            // for DECREMENT / CEILING_RAISE_*
  reason?: string;            // for REJECTED — why the guard said no
  hcsSeq: number | null;      // sequence number of the HCS message for this event
  hcsConsensusTimestamp: string | null;
  txHash?: string;            // underlying settlement tx hash, if applicable
  createdAt: string;
};
```

Why these fields and not fewer: `scope` is what stops "budget for weather data"
from quietly paying for LLM inference. `rateLimit` is what stops a compromised
or buggy agent from draining a month's ceiling in ten seconds even though the
lifetime cap hasn't been hit yet. Raising the ceiling above the original grant
is gated by a real Privy key quorum (§3.4) — a single compromised operator
credential cannot widen an agent's authority alone. Note there's no
`quorumRequiredAboveCeiling` boolean on the type — it's not conditional, the
raise-ceiling route always goes through the quorum-signing path once Privy is
configured (falls back to immediate application only while you're still
setting Privy up, see §3.4).

## 2. Why each sponsor is load-bearing (so you don't accidentally cut one)

| Layer | Sponsor | What it actually does in this build |
|---|---|---|
| **Authority / issuance** | Privy | A quorum-owned Ethereum **policy** stands in for a mandate's ceiling — its rule's numeric value literally *is* the ceiling, scaled to micro-USDC. Raising it requires signatures from enough **Authorization Keys** to meet the quorum's threshold (2-of-2 in the demo setup), submitted synchronously via `privy-authorization-signature`. This is the "no single compromised operator" guarantee, and it does not depend on Privy's Dashboard Approvals feature (see §3.4 for why). |
| **Enforcement / audit** | Hedera | Every mandate lifecycle event (issue, decrement, rejection, ceiling raise, revoke) is submitted as a message to an **HCS topic**. `GET /api/audit/events` (frontend: Audit Trail page) replays the *entire* feed across all mandates, newest first — not just the latest event per mandate — and links straight to the public mirror node so none of it depends on trusting Leash's own database. |
| **Settlement / runtime** | Hedera / Blocky402 | Primary payment rail. Leash's facilitator-proxy sits **in front of** the Blocky402 facilitator (Hedera testnet) and checks the mandate before ever forwarding a payment to `/verify` and `/settle`. The x402 `exact` scheme on Hedera requires a real, partially-signed `TransferTransaction` (see §3.5), not a signed-authorization JSON object like the EVM `exact` scheme uses. |
| **Settlement / runtime (2nd rail)** | Arc / Circle Agent Stack | The same mandate guard, settling real USDC on Arc testnet via a Circle Developer-Controlled Wallet (`@circle-fin/developer-controlled-wallets` SDK) instead of Hedera. This is what proves enforcement is rail-agnostic rather than a Hedera-specific trick, and it's the direct answer to Arc's own docs noting spending-policy guardrails exist but approval prompts are "not a sandbox" — Leash's mandate is the sandbox. |

## 3. The critical risk from the brief, and how the architecture handles it

> "Requires the Blocky402 facilitator to accept a custom verification hook.
> Validate this on day one — if it can't, run your own facilitator and say so
> explicitly."

Blocky402 (like every x402 v2 facilitator) exposes exactly two endpoints:
`POST /verify` and `POST /settle`. **It does not expose a pre-verify hook for
third-party business logic** — that's explicitly out of scope for the x402
core spec (budget/session management is called out as "out of scope" in the
v2 spec itself). So the correct, low-risk design from day one is:

**Leash never asks Blocky402 to enforce the mandate. Leash enforces the
mandate itself, as a thin facilitator-proxy, and only forwards to Blocky402's
`/verify` + `/settle` for payments it has already approved.**

This is strictly better than hoping for a hook, it works today with zero
dependency risk, and it's exactly the "run your own facilitator and say so
explicitly" fallback the brief tells you to plan for — so build it as the
plan, not the fallback. Say this explicitly in your README/demo: *"Leash is
its own x402 facilitator-proxy in front of Blocky402; mandate enforcement
happens in the proxy, settlement happens on Blocky402/Hedera."*

## 3.4 Privy: what the ceiling-raise quorum actually gates, and why the design changed mid-build

Privy's policy engine gates **real wallet transaction methods** scoped to a
`chain_type` (`eth_sendTransaction`, `transfer`, `eth_signTypedData_v4`,
etc.) — there is no generic "arbitrary business field" policy type. Leash's
mandate ceiling isn't a value on a real Privy-managed wallet (the agent
settles via a raw Hedera key and a Circle wallet, not a Privy wallet), so a
literal reading of "gate the ceiling with Privy" doesn't map onto anything
Privy's API actually offers.

The resolution: create one quorum-owned **Ethereum policy** whose single rule
(`method: eth_sendTransaction`, `action: ALLOW`, condition `value lte X`) is
never evaluated against a real transaction — its numeric value is set to
literally equal the mandate's ceiling (scaled to micro-USDC), and Leash
mirrors whatever value that policy carries into its own `mandate.ceiling`.
Nothing about this rule enforces a real on-chain transfer cap; what's real is
that **changing that number requires genuine signatures from enough
Authorization Keys to meet the quorum's threshold** — the actual mechanism
the pitch asked for ("a key quorum is required to raise a ceiling"). Say this
plainly in your demo rather than implying Privy is gating fund movement
directly.

Two ways to get a quorum-gated update through Privy's API, and why we use the
second one:

1. **Async intents** (`PATCH /v1/apps/{app_id}/intents/policies/{policy_id}`,
   no signature attached) — creates a request that sits pending until quorum
   members approve it from the Privy **Dashboard**, with biometric/TOTP.
   This requires **Dashboard Approvals** enabled for your Privy account,
   which is a support-gated feature (`403 Dashboard approvals is not enabled
   for this account`) that may not clear in time for a hackathon.
2. **Synchronous signed update** (`PATCH /v1/policies/{policy_id}`, WITH a
   `privy-authorization-signature` header) — the request is signed by
   enough Authorization Keys up front, using
   `generateAuthorizationSignature({ authorizationPrivateKey, input })`
   once per key (it signs with one key per call; call it once per quorum
   member and join the results with a comma). This executes immediately,
   requires no Dashboard feature, and is what `raiseCeilingWithSignatures()`
   in `privyService.ts` uses. The async intents functions are kept in the
   file only as reference for later if Dashboard Approvals gets enabled.

Practical setup note: pure Authorization-Key quorums (no `user_ids`) can be
created directly in the Dashboard's **Wallets → Authorization keys** page —
"New key" to generate each team member's key, then "New key → Register key
quorum" to group them with a threshold. No API call, no gated feature,
needed for quorum *creation* — only the async-intents *approval flow* is gated.

## 3.5 Two settlement rails, two different payload models

The two rails don't just differ in which SDK gets called — they require
fundamentally different **shapes of payment proof**, because Hedera and
Arc/EVM have different account and transaction models:

- **Hedera (`exact` scheme via Blocky402):** there is no EIP-3009-style
  signed authorization object on Hedera. The client (agent) must build an
  actual `TransferTransaction` — debiting itself, crediting `payTo`, with
  the transaction ID's *payer* set to the facilitator's `feePayer` account —
  sign it with its own key (required since it's the account losing funds),
  leave the fee payer's signature slot empty, freeze it, and serialize to
  base64. That base64 blob is the entire `payload.transaction` field
  Blocky402 expects; the facilitator adds its own signature and submits at
  `/settle`. This is what `hederaPaymentClient.ts`'s
  `buildHederaExactPayload()` does, standing in for "the agent" until a real
  external agent wallet exists. The asset field must be Hedera's actual HTS
  token ID for USDC on testnet (`0.0.429274`), not the string `"USDC"`.
- **Arc (Circle Agent Stack):** `arcAgentService.ts` uses
  `@circle-fin/developer-controlled-wallets`'s `createTransaction()` /
  `getTransaction()` pair — `createTransaction` returns almost immediately
  with just an id and a pending state, so the client polls
  `getTransaction()` until a terminal state (`COMPLETE`/`FAILED`/
  `CANCELLED`/`DENIED`). Circle's `tokenId` is an internal UUID resolved
  from the wallet's own token balances (`getWalletTokenBalance`), not a
  symbol or contract address — `resolveUsdcTokenId()` looks it up and
  caches it. `createTransaction`'s `amounts` field takes a plain decimal
  USDC string directly — no smallest-unit scaling, unlike the Hedera side.

Both rails still report into the identical `DECREMENT` HCS event shape
(§4), tagged with `rail`, so the audit trail doesn't need to know or care
which one settled a given payment.

## 4. End-to-end sequence (the demo flow)

```
Human (2 quorum members)     Leash Backend                 Hedera HCS
     |                             |                               |
     | 1. Log in, create mandate  |                               |
     |---------------------------->|                               |
     |                             | 2. Sign mandate (placeholder issuer
     |                             |    signature — see routes/mandates.ts)
     |                             | 3. Submit ISSUED event to HCS topic
     |                             |------------------------------->|
     |                             |<-- seq #, consensus timestamp -|
     |     (mandate now live)      |                               |
     |                             |                               |
     | 4. Request ceiling raise    |                               |
     |---------------------------->|                               |
     |                             | 5. Build PATCH /v1/policies/{id} body
     | (member A signs w/ their    |                               |
     |  own Authorization Key)     |                               |
     |----------------------------->  6. Collect signature A       |
     | (member B signs w/ their    |                               |
     |  own Authorization Key)     |                               |
     |----------------------------->  7. Collect signature B       |
     |                             | 8. PATCH policy w/ both sigs -> Privy
     |                             |    (executes immediately — no async
     |                             |     intents/Dashboard queue needed)
     |                             | 9. Apply new ceiling locally,
     |                             |    submit CEILING_RAISE_EXECUTED to HCS
     |                             |------------------------------->|

Agent                         Leash Facilitator-Proxy        Blocky402 / Circle     Resource server
  |                                  |                              |                    |
  | GET /premium-data                |                             |                     |
  |---------------------------------->                             |                     |
  |                                  | 402 Payment Required (price, scope) |             |
  |<----------------------------------                              |                    |
  | builds a rail-specific payment   |                              |                    |
  | proof (see §3.5), attaches       |                              |                    |
  | X-Mandate-Id + X-Payment-Amount  |                              |                    |
  | headers, POSTs /api/pay          |                              |                    |
  |---------------------------------->                              |                    |
  |                       10. mandateGuard(): check scope, ceiling,  |                    |
  |                           rate limit, expiry, revoked            |                    |
  |                                  |                              |                    |
  |                       -- if REJECTED --                         |                    |
  |            <---------------------  403 { reason } (no forward)  |                    |
  |                                  |                              |                    |
  |                       -- if APPROVED --                         |                    |
  |                    rail="hedera": POST /verify, /settle -------->|                   |
  |                    rail="arc": createTransaction, poll --------->|                   |
  |                                  |<---- tx hash / poll result ---|                   |
  |                                  | 11. decrement mandate.spent   |                    |
  |                                  | 12. submit DECREMENT event to HCS (tagged w/ rail)|
  |                                  |------------------------------->|                   |
  |                                  |          forward request ---------------------->  |
  |<-------------------------------- 200 OK + resource -----------------------------------|
```

Step 10 is the whole product. Everything else is plumbing to make step 10
real and demoable.

The agent's request carries a `rail` field (`"hedera"` or `"arc"`). Step 10
(`mandateGuard` + `evaluateMandate`) runs identically regardless of rail —
only what happens *after* approval differs, per rail-specific mechanics
detailed in §3.5. Both paths append the same `DECREMENT` event shape to HCS,
tagged with which rail settled it — one mandate, one audit trail, two rails.
The audit trail itself (`GET /api/audit/events`) is the full flattened feed
across all mandates, not a per-mandate summary — see the Audit Trail page.

## 5. Component map

```
frontend (Vite+React+Tailwind)
 ├─ Privy login (human = mandate issuer, id flows into issuerUserId)
 ├─ Dashboard: create/revoke/raise-ceiling + a visible Activity Log panel
 │  (every action's result appears there immediately — issuing, revoking,
 │  raising — independent of the mandate card's own state settling)
 ├─ Audit Trail: full flattened event feed across all mandates via
 │  GET /api/audit/events, newest first, plus the raw HCS mirror-node link
 └─ Agent Simulator: pick a settlement rail (Hedera/Blocky402 or
    Arc/Circle Agent Stack), fire simulated purchases against the gated
    resource, watch mandates get accepted/rejected live on either rail
    through the same guard

backend (Express + TypeScript)
 ├─ routes/mandates.ts      CRUD + raise-ceiling (Privy-signed, synchronous) + revoke
 ├─ routes/resource.ts      the gated resource server (returns 402, then 200)
 ├─ routes/pay.ts           the facilitator-proxy entrypoint agents call;
 │                          dispatches to whichever rail the request asks for
 │                          ONLY after mandateGuard has already approved it
 ├─ routes/audit.ts         GET /events (full trail) + GET /mirror-url
 ├─ middleware/mandateGuard.ts    the enforcement logic (the whole point)
 ├─ services/hcsService.ts       HCS topic create/submit (Hedera SDK)
 ├─ services/privyService.ts     mandate signing stub + the quorum-owned
 │                               ceiling policy + synchronous signed raises
 │                               (see §3.4) — async-intents fns kept as
 │                               reference only, unused by default
 ├─ services/facilitatorClient.ts thin client for Blocky402 /verify /settle,
 │                                builds x402 v2 PaymentRequirements
 ├─ services/hederaPaymentClient.ts builds the partially-signed Hedera
 │                                  TransferTransaction the exact scheme
 │                                  needs (see §3.5)
 ├─ services/arcAgentService.ts  Circle Agent Stack client: resolves the
 │                               USDC tokenId, settles via createTransaction
 │                               + polls to a terminal state, falls back to
 │                               a clearly-labelled mock so the demo never
 │                               blocks on sandbox-access delays
 ├─ services/mandateService.ts   in-memory store of mandates + events, plus
 │                               listAllEventsEnriched() for the audit feed
 └─ scripts/                     one-time setup: setupArcWallets.ts,
                                  setupPrivyPolicy.ts, debugPrivyQuorum.ts
                                  (cross-checks policy owner vs. quorum
                                  membership when a signature gets rejected)
```

## 6. Tech stack (locked in)

- **Frontend:** Vite + React + TypeScript + Tailwind CSS, React Router, `@privy-io/react-auth`, TanStack Query, Recharts.
- **Backend:** Node.js + Express + TypeScript, `@hashgraph/sdk` (HCS + building the Hedera `exact`-scheme payload), `@privy-io/node` (key quorums, policies, authorization signatures — required specifically because key quorums are **not** available in `@privy-io/server-auth`), `@circle-fin/developer-controlled-wallets` (Arc settlement), a JSON-file-snapshotted in-memory store (swap for SQLite/Prisma post-hackathon — nothing else in the codebase needs to change since everything only talks to `mandateService.ts`'s functions).
- **Payment rail 1:** x402 v2 (hand-rolled header/payload construction — see §3.5), Blocky402 testnet facilitator on `hedera-testnet` (`https://api.testnet.blocky402.com`), USDC via its real Hedera HTS token id `0.0.429274` (testnet).
- **Payment rail 2:** Arc testnet via Circle's Agent Stack — a Developer-Controlled Wallet holding testnet USDC, settled through Circle's official SDK. Falls back to a mock settlement (clearly labelled) if sandbox credentials aren't configured yet.
- **Authority layer:** Privy Authorization Keys + a quorum-owned Ethereum policy standing in for the mandate ceiling (§3.4) — no Privy-managed wallet is involved in either settlement rail; Privy's role is strictly gating the administrative act of raising a ceiling, matching the pitch's original framing of Privy as the human-authority layer, not a settlement rail.
- **Chains:** Hedera testnet (HCS topic + Blocky402 settlement) and Arc testnet (Circle Agent Stack settlement), both driven from the same mandate.