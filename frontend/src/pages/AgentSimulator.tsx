import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type LogLine = {
  id: string;
  ok: boolean;
  rail: string;
  amount: number;
  message: string;
  mocked?: boolean;
  txHash?: string;
};

export function AgentSimulator() {
  const mandatesQuery = useQuery({ queryKey: ["mandates"], queryFn: api.listMandates });
  const railsQuery = useQuery({ queryKey: ["rails"], queryFn: api.rails, refetchInterval: 10000 });

  const [mandateId, setMandateId] = useState<string>("");
  const [amount, setAmount] = useState("0.10");
  const [rail, setRail] = useState<"hedera" | "arc">("hedera");
  const [log, setLog] = useState<LogLine[]>([]);

  const payMutation = useMutation({
    mutationFn: () => api.pay(mandateId, Number(amount), rail),
  });

  const fireRequest = async () => {
    if (!mandateId) return;
    try {
      const result = await payMutation.mutateAsync();
      setLog((l) => [
        {
          id: crypto.randomUUID(),
          ok: true,
          rail,
          amount: Number(amount),
          message: `settled${result.mocked ? " (mock — Arc sandbox creds not set)" : ""} on ${result.network}`,
          mocked: result.mocked,
          txHash: result.txHash,
        },
        ...l,
      ]);
    } catch (e: any) {
      setLog((l) => [
        { id: crypto.randomUUID(), ok: false, rail, amount: Number(amount), message: e.message },
        ...l,
      ]);
    }
  };

  const activeMandate = mandatesQuery.data?.find((m) => m.id === mandateId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Agent Simulator</h1>
      <p className="mt-1 text-sm text-slate-400">
        Play the agent. Every request goes through Leash's facilitator-proxy: the mandate is
        checked <span className="text-slate-200">before</span> either rail is ever touched. Rail
        choice is cosmetic to the guard — it enforces identically whether settlement happens on
        Hedera via Blocky402 or on Arc via Circle's Agent Stack wallet.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <label className="block text-xs text-slate-400">
            Mandate
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
              value={mandateId}
              onChange={(e) => setMandateId(e.target.value)}
            >
              <option value="">select a mandate...</option>
              {mandatesQuery.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.agentId} — ${m.spent.toFixed(2)}/${m.ceiling.toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            Amount (USDC)
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <div className="text-xs text-slate-400">
            Settlement rail
            <div className="mt-1 flex gap-2">
              <RailButton
                label="Hedera (Blocky402)"
                active={rail === "hedera"}
                live={railsQuery.data?.hedera.live}
                onClick={() => setRail("hedera")}
              />
              <RailButton
                label="Arc (Circle Agent Stack)"
                active={rail === "arc"}
                live={railsQuery.data?.arc.live}
                onClick={() => setRail("arc")}
              />
            </div>
          </div>

          <button
            onClick={fireRequest}
            disabled={!mandateId || payMutation.isPending}
            className="w-full rounded-md bg-cyan-500 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {payMutation.isPending ? "Sending..." : "Fire agent request"}
          </button>

          {activeMandate && (
            <p className="text-xs text-slate-500">
              remaining: ${(activeMandate.ceiling - activeMandate.spent).toFixed(4)} · scope:{" "}
              {activeMandate.scope.join(", ")}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 font-medium">Request log</h2>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {log.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
            {log.map((l) => (
              <div
                key={l.id}
                className={`rounded border p-2 text-xs ${
                  l.ok ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : "border-red-900 bg-red-950/40 text-red-300"
                }`}
              >
                <p className="font-medium">
                  {l.ok ? "APPROVED" : "REJECTED"} — ${l.amount.toFixed(2)} via {l.rail}
                </p>
                <p className="mt-0.5 text-slate-400">{l.message}</p>
                {l.txHash && <p className="mt-0.5 font-mono text-slate-500 break-all">{l.txHash}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RailButton({
  label,
  active,
  live,
  onClick,
}: {
  label: string;
  active: boolean;
  live?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded border px-2 py-2 text-xs ${
        active ? "border-cyan-500 bg-cyan-950/50 text-cyan-300" : "border-slate-700 bg-slate-950 text-slate-400"
      }`}
    >
      {label}
      <br />
      <span className={live ? "text-emerald-400" : "text-yellow-500"}>
        {live === undefined ? "checking..." : live ? "live" : "mock mode"}
      </span>
    </button>
  );
}