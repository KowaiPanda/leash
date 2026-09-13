import { Routes, Route } from "react-router-dom";
import { Nav } from "./components/Nav";
import { Dashboard } from "./pages/Dashboard";
import { AgentSimulator } from "./pages/AgentSimulator";
import { AuditLog } from "./pages/AuditLog";

function App() {
  return (
  <div className="min-h-screen">
    <Nav />
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/simulator" element={<AgentSimulator />} />
      <Route path="/audit" element={<AuditLog />} />
    </Routes>
    </div>  
  )
}

export default App