import type { Mandate } from "../lib/api";

export function MandateCard({
  mandate,
  onRevoke,
  onRaiseCeiling,
  onCheckCeilingRaise,
}: {
  mandate: Mandate;
  onRevoke?: (id: string) => void;
  onRaiseCeiling?: (id: string, current: number) => void;
  onCheckCeilingRaise?: (id: string) => void;
}) {
  const pct = Math.min(100, (mandate.spent / mandate.ceiling) * 100);
  const expired = new Date(mandate.expiresAt).getTime() < Date.now();

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs text-slate-500">{mandate.id}</p>
          <p className="font-medium">{mandate.agentId}</p>
        </div>
        <div className="flex gap-2">
          {mandate.revoked && (
            <span className="rounded bg-red-950 px-2 py-0.5 text-xs text-red-400">revoked</span>
          )}
          {!mandate.revoked && expired && (
            <span className="rounded bg-yellow-950 px-2 py-0.5 text-xs text-yellow-400">expired</span>
          )}
          {!mandate.revoked && !expired && (
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400">active</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {mandate.scope.map((s) => (
          <span key={s} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {s}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-slate-400">
          <span>
            ${mandate.spent.toFixed(4)} / ${mandate.ceiling.toFixed(2)}
          </span>
          <span>{pct.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full ${pct > 90 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-cyan-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          rate limit: ${mandate.rateLimit.maxAmount} / {mandate.rateLimit.windowSeconds}s · expires{" "}
          {new Date(mandate.expiresAt).toLocaleString()}
        </p>
        {mandate.hcsIssuanceSeq !== null && (
          <p className="mt-1 text-xs text-slate-600">HCS issuance seq #{mandate.hcsIssuanceSeq}</p>
        )}
        {mandate.pendingCeilingRaise && (
          <div className="mt-2 flex items-center justify-between rounded bg-yellow-950 px-2 py-1">
            <span className="text-xs text-yellow-400">
              raise to ${mandate.pendingCeilingRaise.newCeiling.toFixed(2)} pending quorum approval
            </span>
            {onCheckCeilingRaise && (
              <button
                onClick={() => onCheckCeilingRaise(mandate.id)}
                className="ml-2 rounded bg-yellow-900 px-2 py-0.5 text-xs text-yellow-200 hover:bg-yellow-800"
              >
                Check
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {onRaiseCeiling && !mandate.revoked && (
          <button
            onClick={() => onRaiseCeiling(mandate.id, mandate.ceiling)}
            className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
          >
            Raise ceiling
          </button>
        )}
        {onRevoke && !mandate.revoked && (
          <button
            onClick={() => onRevoke(mandate.id)}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-red-400 hover:bg-slate-700"
          >
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}