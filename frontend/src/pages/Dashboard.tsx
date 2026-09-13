import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { MandateCard } from "../components/MandateCard";

export function Dashboard() {
  const qc = useQueryClient();
  const mandatesQuery = useQuery({ queryKey: ["mandates"], queryFn: api.listMandates, refetchInterval: 4000 });

  const [form, setForm] = useState({
    agentId: "agent-research-bot",
    scope: "/api/premium-data",
    ceiling: "2.00",
    rateMax: "0.50",
    rateWindow: "3600",
    expiresInHours: "24",
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createMandate({
        agentId: form.agentId,
        issuerUserId: "demo-issuer", // replace with the logged-in Privy user id once auth is wired up
        scope: form.scope.split(",").map((s) => s.trim()),
        ceiling: Number(form.ceiling),
        rateLimit: { maxAmount: Number(form.rateMax), windowSeconds: Number(form.rateWindow) },
        expiresAt: new Date(Date.now() + Number(form.expiresInHours) * 3600_000).toISOString(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeMandate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }),
  });

  const raiseMutation = useMutation({
    mutationFn: ({ id, newCeiling }: { id: string; newCeiling: number }) => api.raiseCeiling(id, newCeiling),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }),
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
          {createMutation.isError && (
            <p className="text-xs text-red-400">{(createMutation.error as Error).message}</p>
          )}
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
              onRaiseCeiling={(id, current) => {
                const next = prompt("New ceiling (USDC)?", (current + 1).toFixed(2));
                if (next) raiseMutation.mutate({ id, newCeiling: Number(next) });
              }}
            />
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