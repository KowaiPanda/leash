import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function AuditLog() {
  const mirrorQuery = useQuery({ queryKey: ["mirror-url"], queryFn: api.mirrorUrl });
  const mandatesQuery = useQuery({ queryKey: ["mandates"], queryFn: api.listMandates });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Audit Trail</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every mandate lifecycle event — issuance, spend, ceiling raise, revocation — is written to
        a Hedera Consensus Service topic. This is independently verifiable from the public mirror
        node; it does not depend on trusting Leash's own database.
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

      <div className="mt-6 space-y-3">
        {mandatesQuery.data?.map((m) => (
          <div key={m.id} className="rounded border border-slate-800 bg-slate-900 p-3 text-sm">
            <p className="font-mono text-xs text-slate-500">{m.agentId}</p>
            <p>
              issuance HCS seq:{" "}
              <span className="font-mono">{m.hcsIssuanceSeq ?? "pending"}</span>
            </p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-600">
        Tip for the demo video: paste a mandate's HCS sequence number into HashScan's testnet topic
        explorer next to this screen so the audience sees the same event on both sides.
      </p>
    </div>
  );
}