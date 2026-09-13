import { NavLink } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

const tabs = [
  { to: "/", label: "Mandates" },
  { to: "/simulator", label: "Agent Simulator" },
  { to: "/audit", label: "Audit Trail" },
];

export function Nav() {
  let auth: { authenticated: boolean; login: () => void; logout: () => void; user?: any } | null = null;
  try {
    auth = usePrivy();
  } catch {
    // PrivyProvider not mounted
  }

  return (
    <nav className="mx-auto mt-4 flex w-[95%] max-w-6xl items-center justify-between rounded-3xl border border-gray-700 px-6 py-4 bg-slate-500/50 backdrop-blur-md">
      <div className="flex items-center gap-6">
        <img 
          src="/logo.png" 
          alt="Leash Logo" 
          className="h-12 w-auto object-contain" 
        />
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `text-sm ${isActive ? "text-white font-medium" : "text-slate-200 hover:text-slate-100"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      {/* <div>
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
      </div> */}
    </nav>
  );
}