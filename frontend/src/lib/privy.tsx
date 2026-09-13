import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const appId = import.meta.env.VITE_PRIVY_APP_ID as string;

export function LeashPrivyProvider({ children }: { children: ReactNode }) {
  if (!appId || appId === "your-privy-app-id") {
    // Lets you build/demo the mandate + agent-simulator flow before you've
    // wired up a real Privy app id — login button just won't do anything
    // useful until you set VITE_PRIVY_APP_ID in frontend/.env.
    return <>{children}</>;
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        embeddedWallets: { createOnLogin: "users-without-wallets" },
        appearance: { theme: "dark", accentColor: "#22d3ee" },
      }}
    >
      {children}
    </PrivyProvider>
  );
}