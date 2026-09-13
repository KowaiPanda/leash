import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../lib/api";
import { MandateCard } from "../components/MandateCard";

type LogLine = {
  id: string;
  ok: boolean;
  action: string;
  message: string;
  at: string;
};

export function Dashboard() {
  const qc = useQueryClient();
  const mandatesQuery = useQuery({ queryKey: ["mandates"], queryFn: api.listMandates, refetchInterval: 4000 });

  let privyUser: { id: string } | null | undefined;
  try {
    ({ user: privyUser } = usePrivy());
  } catch {
    // PrivyProvider not mounted yet (VITE_PRIVY_APP_ID unset) — fall back below.
  }

  const [form, setForm] = useState({
    agentId: "agent-research-bot",
    scope: "/api/premium-data",
    ceiling: "2.00",
    rateMax: "0.50",
    rateWindow: "3600",
    expiresInHours: "24",
  });

  const [log, setLog] = useState<LogLine[]>([]);
  const pushLog = (ok: boolean, action: string, message: string) =>
    setLog((l) => [{ id: crypto.randomUUID(), ok, action, message, at: new Date().toISOString() }, ...l].slice(0, 50));

  const createMutation = useMutation({
    mutationFn: () =>
      api.createMandate({
        agentId: form.agentId,
        issuerUserId: privyUser?.id ?? "demo-issuer",
        scope: form.scope.split(",").map((s) => s.trim()),
        ceiling: Number(form.ceiling),
        rateLimit: { maxAmount: Number(form.rateMax), windowSeconds: Number(form.rateWindow) },
        expiresAt: new Date(Date.now() + Number(form.expiresInHours) * 3600_000).toISOString(),
      }),
    onSuccess: (mandate) => {
      qc.invalidateQueries({ queryKey: ["mandates"] });
      pushLog(true, "Issue mandate", `${mandate.agentId} — ceiling $${mandate.ceiling.toFixed(2)}, HCS seq #${mandate.hcsIssuanceSeq ?? "pending"}`);
    },
    onError: (e: Error) => pushLog(false, "Issue mandate", e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeMandate(id),
    onSuccess: (mandate) => {
      qc.invalidateQueries({ queryKey: ["mandates"] });
      pushLog(true, "Revoke", `${mandate.agentId} revoked`);
    },
    onError: (e: Error) => pushLog(false, "Revoke", e.message),
  });

  const raiseMutation = useMutation({
    mutationFn: ({ id, newCeiling }: { id: string; newCeiling: number }) => api.raiseCeiling(id, newCeiling),
    onSuccess: (mandate) => {
      qc.invalidateQueries({ queryKey: ["mandates"] });
      pushLog(true, "Raise ceiling", `${mandate.agentId} → $${mandate.ceiling.toFixed(2)}`);
    },
    onError: (e: Error) => pushLog(false, "Raise ceiling", e.message),
  });

  const checkCeilingMutation = useMutation({
    mutationFn: (id: string) => api.checkCeilingRaise(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["mandates"] });
      pushLog(true, "Check ceiling raise", `status: ${result.intentStatus}`);
    },
    onError: (e: Error) => pushLog(false, "Check ceiling raise", e.message),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Mandates</h1>
      <p className="mt-1 text-sm text-slate-400">
        Issue a bounded, revocable budget grant for an agent. Every issuance, spend, and ceiling
        change is written to Hedera Consensus Service.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-span-1"
        >
          <h2 className="font-medium">New mandate</h2>
          <Field label="Agent id" value={form.agentId} onChange={(v) => setForm({ ...form, agentId: v })} />
          <Field
            label="Scope (comma-separated paths)"
            value={form.scope}
            onChange={(v) => setForm({ ...form, scope: v })}
          />
          <Field label="Ceiling (USDC)" value={form.ceiling} onChange={(v) => setForm({ ...form, ceiling: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rate max" value={form.rateMax} onChange={(v) => setForm({ ...form, rateMax: v })} />
            <Field
              label="Window (s)"
              value={form.rateWindow}
              onChange={(v) => setForm({ ...form, rateWindow: v })}
            />
          </div>
          <Field
            label="Expires in (hours)"
            value={form.expiresInHours}
            onChange={(v) => setForm({ ...form, expiresInHours: v })}
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full rounded-md bg-cyan-500 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {createMutation.isPending ? "Issuing..." : "Issue mandate"}
          </button>
        </form>

        <div className="space-y-4 lg:col-span-2">
          {mandatesQuery.data?.length === 0 && (
            <p className="text-sm text-slate-500">No mandates yet — issue one on the left.</p>
          )}
          {mandatesQuery.data?.map((m) => (
            <MandateCard
              key={m.id}
              mandate={m}
              onRevoke={(id) => revokeMutation.mutate(id)}
              onCheckCeilingRaise={(id) => checkCeilingMutation.mutate(id)}
              onRaiseCeiling={(id, current) => {
                const next = prompt("New ceiling (USDC)?", (current + 1).toFixed(2));
                if (next) raiseMutation.mutate({ id, newCeiling: Number(next) });
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-2 font-medium">Activity log</h2>
        <p className="mb-3 text-xs text-slate-500">
          Every action you take here — issue, revoke, raise ceiling — shows up immediately below,
          so the outcome is visible without waiting on the card to visually update.
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {log.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
          {log.map((l) => (
            <div
              key={l.id}
              className={`rounded border p-2 text-xs ${
                l.ok
                  ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
                  : "border-red-900 bg-red-950/40 text-red-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {l.ok ? "✓" : "✗"} {l.action}
                </span>
                <span className="opacity-60">{new Date(l.at).toLocaleTimeString()}</span>
              </div>
              <p className="mt-0.5 opacity-90">{l.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}