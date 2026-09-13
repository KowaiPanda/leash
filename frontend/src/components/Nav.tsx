import { NavLink } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

const tabs = [
  { to: "/", label: "Mandates" },
  { to: "/simulator", label: "Agent Simulator" },
  { to: "/audit", label: "Audit Trail" },
];

type OptionalAuth = { authenticated: boolean; login: () => void; logout: () => void; user?: any } | null;

function useOptionalPrivy(): OptionalAuth {
  try {
    return usePrivy();
  } catch {
    // PrivyProvider not mounted (no VITE_PRIVY_APP_ID yet) — nav still renders.
    return null;
  }
}

export function Nav() {
  const auth = useOptionalPrivy();

  return (
    <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <div className="flex items-center gap-6">
        <span className="text-lg font-semibold tracking-tight text-cyan-400">Leash</span>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `text-sm ${isActive ? "text-white font-medium" : "text-slate-400 hover:text-slate-200"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="hidden">
        {auth?.authenticated ? (
          <button onClick={auth.logout} className="text-sm text-slate-400 hover:text-slate-200">
            Log out
          </button>
        ) : (
          <button
            onClick={auth?.login}
            className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
          >
            {auth ? "Log in with Privy" : "Set VITE_PRIVY_APP_ID"}
          </button>
        )}
      </div>
    </nav>
  );
}