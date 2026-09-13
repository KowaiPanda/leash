# LEASH
### The budget an agent cannot talk its way out of.

LEASH is a protocol-enforced spending **mandate** for AI agents: a signed,
revocable, on-chain-anchored budget grant that an agent must present
alongside every payment. The cap is checked by the payment rail itself,
before settlement — not by the agent's own good behaviour, and not by a
prompt telling it to be careful.

Built for ETHOnline 2026 on three sponsors — **Hedera**, **Privy**, and
**Arc / Circle** — enforcing one mandate across two independent settlement
rails.

Live Now: `https://leash-kowaipanda.vercel.app/` · Hedera Testnet + Arc Testnet · Self-issued mandates · Dual-rail settlement

---

## Why LEASH

You cannot currently give an agent a wallet and a bounded, enforceable
budget. The x402 v2 specification puts client-side budget management and
session handling explicitly **out of scope**. Arc's own Agent Stack docs
note that its OTP-gated wallet cap approval prompts are **"not a sandbox."**
Today, "authorize an agent" means handing it a key and hoping.

LEASH is the enforcement layer nobody shipped: a mandate that lives outside
the agent, checked by the payment rail itself, on every single request.

**SCOPE.** A mandate names exactly which resources an agent may ever pay for.
**CEILING.** A hard lifetime cap the agent cannot spend past — enforced before settlement, not after.
**RATE LIMIT.** A per-window cap, so a compromised or looping agent can't drain a month's budget in ten seconds even under the lifetime ceiling.
**AUDIT.** Every issuance, spend, rejection, and ceiling change is written to Hedera Consensus Service — independently replayable, not just a row in our own database.
**AUTHORITY.** Raising a ceiling requires signatures from a real Privy key quorum. No single operator, however compromised, can widen an agent's authority alone.

## What we built

### 1. Hedera — the enforcement chokepoint and the audit trail · `backend/src/middleware/mandateGuard.ts`, `backend/src/services/hcsService.ts`

Every payment attempt is checked against the mandate's live state — scope,
remaining ceiling, rate-limit window, expiry, revocation — **before** any
settlement call is ever made. A rejected request never reaches the payment
rail at all; no on-chain call is attempted for a payment that violates the
mandate.

Blocky402 (the x402 v2 facilitator we settle through on Hedera testnet)
exposes exactly `/verify` and `/settle` — there's no third-party
verification hook, by design of the core x402 spec. So LEASH **is** its own
facilitator-proxy in front of Blocky402, rather than hoping for a hook that
doesn't exist. Hedera's `exact` payment scheme has no EIP-3009-style signed
authorization object the way EVM chains do; the agent instead builds and
signs a real, partially-signed `TransferTransaction` (`hederaPaymentClient.ts`),
which the facilitator co-signs and settles.

Every mandate lifecycle event — issued, spent, rejected, ceiling raised,
revoked — is submitted to an **HCS topic** and independently readable from
the public mirror node, with its own consensus timestamp and sequence
number that LEASH's own server never generated.

### 2. Privy — the authority layer · `backend/src/services/privyService.ts`

A mandate's ceiling is mirrored into a real, **quorum-owned Ethereum
policy** in Privy — its rule's numeric value literally is the ceiling.
Raising it requires signatures from enough Authorization Keys to meet the
quorum's threshold (2-of-2 in this build), submitted via
`generateAuthorizationSignature()` and a `privy-authorization-signature`
header. Privy rejects the update outright if the signature threshold isn't
met — this is enforced by Privy's own backend, not by LEASH trusting itself.

### 3. Arc / Circle Agent Stack — the second settlement rail · `backend/src/services/arcAgentService.ts`

The identical mandate guard, settling real USDC on **Arc testnet** through a
Circle Developer-Controlled Wallet instead of Hedera. This is what proves
enforcement is rail-agnostic rather than a Hedera-specific trick — the exact
answer to Arc's own docs noting its spending-policy guardrails exist but
aren't a sandbox. Falls back to a clearly-labelled mock settlement if
sandbox credentials aren't configured, so the mandate logic is demoable
either way.

### 4. The Agent Simulator — proving it live · `frontend/src/pages/AgentSimulator.tsx`

Pick a mandate, pick a rail, fire a request. Approved requests settle and
move the spend bar; rejected ones show the guard's exact reason — and never
touch the settlement rail at all. Flip the rail toggle mid-session and watch
the identical guard logic reject or approve on Arc exactly as it did on
Hedera.

## Live and verifiable

| | |
|---|---|
| Live app | `https://leash-kowaipanda.vercel.app/` |
| Hedera HCS audit topic | `0.0.10473152` |
| Hedera mirror node feed | `https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10473152/messages` |
| Example mandate (Hedera rail) | `d49752e0-dda4-41b2-abfa-a984377ff478` — issuance HCS seq `#29` |
| Example settlement tx (Hedera / Blocky402) | `0.0.7162784@1789277457.419859171` |
| Example settlement tx (Arc / Circle) | `0x7de3aa03d882b08a1620d49bd0d173c977a5476dc89f23d626ccf2452bc52056` |
| Privy ceiling-raise policy | `h761x57nvo7k1fpd8oapthgi`, quorum `cs35970fh5f8cc2rexmwci17`, threshold 2-of-2 |

Explorers: Hedera Testnet mirror node · Arc Testnet block explorer.

## Architecture

- **Enforcement-first.** `mandateGuard` runs before either settlement rail is ever touched — rejections cost nothing on-chain.
- **Rail-agnostic.** The same guard decision governs settlement on Hedera (via Blocky402) and Arc (via Circle's Agent Stack SDK).
- **Independently auditable.** Every event lands on Hedera Consensus Service; the full trail is replayable from the public mirror node, not just from LEASH's own store.
- **Human-authorized, not single-operator-authorized.** Ceiling increases require a real Privy key quorum's signatures, enforced by Privy's backend.

Full data model, sequence diagrams, and the reasoning behind each design
decision (including two mid-build corrections around Hedera's `exact`
payload format and Privy's real policy schema) live in `ARCHITECTURE.md`.

## Run it

```bash
# 1. Set up Environment Variables
cp backend/.env.example backend/.env     # fill in Hedera / Privy / Circle credentials
cp frontend/.env.example frontend/.env

# 2. Install Dependencies
npm install                              # installs root dependencies (concurrently)
cd backend && npm install
cd ../frontend && npm install
cd ..

# 3. Start Both Servers Concurrently
npm run dev                              # Backend: http://localhost:4000 | Frontend: http://localhost:5173
```

One-time setup scripts, in order, once the base `.env` values above are in place:

```bash
npm run setup:arc            # creates the agent + payee wallets on Arc testnet
npm run setup:privy-policy   # creates the quorum-owned ceiling policy
```

---

*Hedera enforces it. Privy authorizes it. Arc proves it isn't a Hedera trick.
The mandate is the only thing any of them ever have to trust.*