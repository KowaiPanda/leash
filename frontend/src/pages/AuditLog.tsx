import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const TYPE_STYLES: Record<string, string> = {
  ISSUED: "border-cyan-900 bg-cyan-950/40 text-cyan-300",
  DECREMENT: "border-emerald-900 bg-emerald-950/40 text-emerald-300",
  REJECTED: "border-red-900 bg-red-950/40 text-red-300",
  CEILING_RAISE_PROPOSED: "border-yellow-900 bg-yellow-950/40 text-yellow-300",
  CEILING_RAISE_EXECUTED: "border-yellow-900 bg-yellow-950/40 text-yellow-200",
  REVOKED: "border-slate-700 bg-slate-800/60 text-slate-300",
};

export function AuditLog() {
  const mirrorQuery = useQuery({ queryKey: ["mirror-url"], queryFn: api.mirrorUrl });
  const eventsQuery = useQuery({ queryKey: ["all-events"], queryFn: api.allEvents, refetchInterval: 4000 });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Audit Trail</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every mandate lifecycle event — issuance, spend, rejection, ceiling raise, revocation —
        across every mandate, newest first. Each one is also written to Hedera Consensus Service,
        independently verifiable from the public mirror node without trusting Leash's own database.
      </p>

      {mirrorQuery.data && (
        <a
          href={mirrorQuery.data.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-md bg-slate-800 px-3 py-2 text-sm text-cyan-300 hover:bg-slate-700"
        >
          Open raw HCS topic feed on the mirror node ↗
        </a>
      )}

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">HCS Seq</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Consensus Time</th>
              <th className="px-4 py-3 font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {eventsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No events yet — issue a mandate or fire an agent request.
                </td>
              </tr>
            )}
            
            {eventsQuery.data?.map((e) => (
              <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                
                {/* HCS Sequence */}
                <td className="px-4 py-3 text-xs opacity-80">
                  {e.hcsSeq !== null ? `#${e.hcsSeq}` : "-"}
                </td>

                {/* Type Pill */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
                      TYPE_STYLES[e.type] ?? "border-slate-800 bg-slate-900 text-slate-300"
                    }`}
                  >
                    {e.type.replaceAll("_", " ")}
                  </span>
                </td>

                {/* Timestamp */}
                <td className="px-4 py-3 text-xs opacity-80">
                  {new Date(e.createdAt).toLocaleString()}
                </td>

                {/* Agent ID */}
                <td className="px-4 py-3 font-mono text-xs opacity-90">
                  {e.agentId || "-"}
                </td>

                {/* Amount */}
                <td className="px-4 py-3 text-xs">
                  {e.amount !== undefined ? `$${e.amount.toFixed(4)}` : "-"}
                </td>

                {/* Reason (Truncated) */}
                <td 
                  className="px-4 py-3 max-w-[150px] truncate text-xs opacity-90" 
                  title={e.reason}
                >
                  {e.reason || "-"}
                </td>

                {/* Consensus Timestamp */}
                <td className="px-4 py-3 text-xs opacity-80">
                  {e.hcsConsensusTimestamp
                    ? new Date(e.hcsConsensusTimestamp).toLocaleTimeString()
                    : "-"}
                </td>

                {/* TX Hash (Truncated) */}
                <td 
                  className="px-4 py-3 max-w-[120px] truncate font-mono text-xs opacity-80" 
                  title={e.txHash}
                >
                  {e.txHash || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}