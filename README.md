# Leash — protocol-enforced spending mandates for agents

Leash lets a human issue an agent a **Mandate**: a signed, revocable, on-chain-logged
budget grant (scope + ceiling + rate limit + expiry). Every x402 payment an agent
makes is checked against its mandate's *remaining allowance* **before** settlement —
so the cap is enforced by the payment rail, not by the agent's own good behaviour.


## Repo layout

```
leash/
  backend/                 <- Node/Express/TypeScript: mandates, facilitator-proxy, HCS, Privy
  frontend/                <- Vite + React + TypeScript + Tailwind: dashboard + agent simulator
```

## Quick start

```bash
npm run dev
```
