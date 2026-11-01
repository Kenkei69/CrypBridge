import {TestnetWorkspace} from './pages/TestnetWorkspace';
import { RedDashboard } from "./pages/RedDashboard";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Shield,
  FlaskConical,
  MessageSquare,
  Activity,
  SlidersHorizontal,
  Lock,
  FileText,
  ScanLine,
  Crosshair,
  Waypoints,
  Flag,
  Building2,
  Menu,
  X,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Check,
  Wallet,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { api } from "./api";
import { workspaceSession } from "./workspace-api";
import { type State, type Report, units, title } from "./model";
import {
  type SimulationState,
  type Simulation,
  attackWindowOpen,
} from "./simulation-model";
import { PurchasingAgent } from "./pages/PurchasingAgent";
import { RedAttack } from "./pages/RedAttack";
import { GuardianPolicies } from "./pages/GuardianPolicy";
import {
  SimulationHistory,
  SimulationTimeline,
  SimulationDecision,
  PurchaseFacts,
  Stage,
} from "./components/Simulation";
import {
  Notice,
  JsonPanel,
  ReportDetails,
  Dialog,
  Empty,
} from "./components/ui";
import { Intelligence, Reports, Integrations } from "./pages/Management";
import { Lab } from "./pages/Lab";
const LegacyApp = React.lazy(() =>
  import("./LegacyApp").then((m) => ({ default: m.LegacyApp })),
);
import "./style.css";
import "./simulation.css";
const blueNav = [
  {
    path: "/blue-team/ai-agent",
    label: "AI purchasing agent",
    icon: MessageSquare,
  },
  {
    path: "/blue-team/payment-monitor",
    label: "Payment monitor",
    icon: Activity,
  },
  {
    path: "/blue-team/security-policies",
    label: "Security policies",
    icon: SlidersHorizontal,
  },
  { path: "/blue-team/anti-drainer", label: "Anti-drainer guard", icon: Lock },
  { path: "/blue-team/security-logs", label: "Security logs", icon: FileText },
];
const redNav = [
  {
    path: "/red-team",
    label: "Pending requests",
    icon: FlaskConical,
  },
  {
    path: "/red-team/attack-builder",
    label: "Attack builder",
    icon: Crosshair,
  },
  {
    path: "/red-team/guard-testing",
    label: "External guard testing",
    icon: ScanLine,
  },
  { path: "/red-team/results", label: "Results & evidence", icon: FileText },
];
const platformNav = [
  {
    path: "/platform/blockchain-tracing",
    label: "Blockchain tracing",
    icon: Waypoints,
  },
  { path: "/platform/scam-reports", label: "Investigation center", icon: Flag },
  {
    path: "/platform/exchange-response",
    label: "Exchange response",
    icon: Building2,
  },
];
export function ArchivedWorkspace() {
  const [path, setPath] = useState(
      location.pathname === "/" ? "/blue-team" : location.pathname,
    ),
    [state, setState] = useState<SimulationState>(),
    [legacy, setLegacy] = useState<State>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ message: string; error: boolean }>(),
    [selected, setSelected] = useState(
      () =>
        new URLSearchParams(location.search).get("simulation") ||
        localStorage.getItem("x402-simulation") ||
        "",
    ),
    [drawer, setDrawer] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [live, setLive] = useState(false),
    [report, setReport] = useState<Report>(),
    [target, setTarget] = useState(""),
    [categories, setCategories] = useState<string[]>([]),
    [register, setRegister] = useState(false);
  const busyRef = useRef(false);
  const red = path.startsWith("/red-team");
  const chatRoute = path === "/blue-team" || path === "/blue-team/ai-agent";
  const team = red ? "red" : "blue";
  const navigate = useCallback((next: string) => {
    history.pushState({}, "", next);
    const destination = new URL(next, location.origin);
    setPath(destination.pathname);
    const sid = destination.searchParams.get("simulation");
    if (sid) {
      setSelected(sid);
      localStorage.setItem("x402-simulation", sid);
    }
    setDrawer(false);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    if (location.pathname === "/") history.replaceState({}, "", "/blue-team");
    const pop = () => {
      setPath(location.pathname);
      setDrawer(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function select(id: string) {
    setSelected(id);
    localStorage.setItem("x402-simulation", id);
  }
  const load = useCallback(async () => {
    if (!location.pathname.startsWith("/archive-disabled")) {window.dispatchEvent(new Event("testnet-refresh"));return undefined;}
    if (location.pathname.startsWith("/legacy")) return undefined;
    try {
      await workspaceSession(
        location.pathname.startsWith("/red-team") ? "red" : "blue",
      );
      const needsLegacy = [
        "/red-team/guard-testing",
        "/red-team/results",
      ].includes(location.pathname);
      const [s, l] = await Promise.all([
        api<SimulationState>("/simulations"),
        needsLegacy ? api<State>("/state") : Promise.resolve(undefined),
      ]);
      setState(s);
      if (l) {
        setLegacy(l);
        setTarget((t) => t || l.guards[0]?.id || "");
      }
      setError("");
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, []);
  useEffect(() => {
    load();
  }, [path, load]);
  useEffect(() => {
    if (location.pathname.startsWith("/legacy")) return;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let stopped = false;
    let disconnected = false;
    function connect() {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      socket.onopen = () => {
        setLive(true);
        if (disconnected) load();
        disconnected = false;
      };
      socket.onmessage = () => {
        if (!busyRef.current) load();
      };
      socket.onerror = () => {
        disconnected = true;
        setLive(false);
      };
      socket.onclose = () => {
        disconnected = true;
        setLive(false);
        if (!stopped) retry = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.error ? 15000 : 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const query = window.matchMedia("(max-width:760px)");
    const changed = () => {
      if (!query.matches) setDrawer(false);
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nav = document.querySelector<HTMLElement>(".simulation-sidebar");
    nav?.querySelector<HTMLElement>(".mobile-close")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab") {
        const nodes = Array.from(
          nav?.querySelectorAll<HTMLElement>("button,a") || [],
        ).filter((el) => el.getClientRects().length);
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [drawer]);
  async function execute<T>(
    fn: () => Promise<T>,
    message = "Operation completed.",
  ): Promise<T | undefined> {
    busyRef.current = true;
    setBusy(true);
    try {
      await workspaceSession(team, true);
      const result = await fn();
      await load();
      setToast({
        message: (result as any)?.clarification
          ? "Please clarify your purchase request."
          : message,
        error: false,
      });
      return result;
    } catch (e) {
      await load();
      setToast({
        message: e instanceof Error ? e.message : String(e),
        error: true,
      });
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const simulation =
    state?.simulations.find((s) => s.id === selected) ||
    state?.simulations.find((s) => attackWindowOpen(s)) ||
    state?.simulations[0];
  const pageTitle =
    path === "/red-team" || path.endsWith("/attack-lab")
      ? "Red Team — Attack Laboratory"
      : path.endsWith("/attack-builder")
        ? "Red Team — Attack Builder"
        : path.endsWith("/guard-testing")
          ? "External Guard Testing"
          : path.endsWith("/results")
            ? "Attack results & evidence"
            : path === "/blue-team" || path.endsWith("/ai-agent")
              ? "Blue Team — Protected AI Agent"
              : path.endsWith("/payment-monitor")
                ? "Payment monitor"
                : path.endsWith("/security-policies")
                  ? "Guardian security policies"
                  : path.endsWith("/anti-drainer")
                    ? "Anti-drainer signing guard"
                    : path.endsWith("/security-logs")
                      ? "Security logs"
                      : path.includes("blockchain")
                        ? "Blockchain tracing"
                        : path.includes("scam")
                          ? "Investigation center"
                          : path.includes("exchange")
                            ? "Exchange response"
                            : "API & integrations";
  if (path.startsWith("/archive-disabled/legacy"))
    return (
      <>
        <a className="legacy-return" href="/blue-team">
          ← Return to Blue / Red workspaces
        </a>
        <React.Suspense
          fallback={
            <div className="loading-state">
              Loading existing assessment tools…
            </div>
          }
        >
          <LegacyApp />
        </React.Suspense>
      </>
    );
  return (
    <div
      className={`app simulation-app ${chatRoute ? "chat-route" : ""} ${red ? "team-red" : "team-blue"} ${collapsed ? "nav-collapsed" : ""} ${drawer ? "drawer-open" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Dismiss navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className="sidebar simulation-sidebar"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer || undefined}
        aria-label="Team workspace navigation"
      >
        <div className="sidebar-top">
          <button
            className="brand"
            onClick={() => navigate("/blue-team")}
            aria-label="x402 home"
          >
            <Shield size={28} />
            <span>
              <strong>x402</strong>
              <small>Red/Blue</small>
            </span>
          </button>
          <button
            className="icon-button collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="team-switch" aria-label="Switch security workspace">
          <button
            className={!red ? "selected" : ""}
            aria-label="Switch to Blue Team"
            onClick={() => navigate("/blue-team/ai-agent")}
          >
            <Shield size={16} />
            <span>Blue Team</span>
          </button>
          <button
            className={red ? "selected red" : ""}
            aria-label="Switch to Red Team"
            onClick={() => navigate("/red-team")}
          >
            <FlaskConical size={16} />
            <span>Red Team</span>
          </button>
        </div>
        <nav aria-label={red ? "Red Team navigation" : "Blue Team navigation"}>
          <div className="nav-group">
            <p className="nav-label">
              {red ? "Adversarial testing" : "Protected purchasing"}
            </p>
            {(red ? redNav : blueNav).map((item) => (
              <button
                key={item.path}
                title={item.label}
                className={`nav-item ${path === item.path || (path === `/${team}-team` && item === (red ? redNav : blueNav)[0]) ? "active" : ""}`}
                aria-current={path === item.path ? "page" : undefined}
                onClick={() => navigate(item.path)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="nav-group platform-group">
            <p className="nav-label">Investigation</p>
            {platformNav.map((item) => (
              <button
                key={item.path}
                className={`nav-item ${path === item.path ? "active" : ""}`}
                onClick={() => navigate(item.path)}
                title={item.label}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="nav-group">
            <p className="nav-label">Tools</p>
            <a
              className="nav-item"
              href="/legacy"
              title="Existing assessment tools"
            >
              <ScanLine size={18} />
              <span>Existing assessment tools</span>
            </a>
            <button
              className="nav-item"
              title="Adapter documentation"
              onClick={() => navigate("/platform/integrations")}
            >
              <FileText size={18} />
              <span>Adapter documentation</span>
            </button>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-mode">
            <Lock size={13} />
            <span>Base Sepolia Testnet</span>
          </div>
          <div className="account-button">
            <span className="avatar">DO</span>
            <span>
              <strong>Demo operator</strong>
              <small>{red ? "Attacker workspace" : "Defender workspace"}</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace" inert={drawer}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <span className="workspace-breadcrumb">
              {red ? "Red Team" : "Blue Team"}
              <span>/</span>
              {red ? "Guardian attack testing" : "Protected agent"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <i />
              Base Sepolia Testnet
            </span>
            <span className={`live-indicator ${live ? "connected" : ""}`}>
              {live ? "Live" : "Reconnecting"}
            </span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
              <button onClick={load}>Retry connection</button>
            </div>
          )}
          <div className="page-header">
            <div>
              <span className="eyebrow">
                {red
                  ? "Controlled adversarial testing"
                  : "Secure autonomous purchasing"}
              </span>
              <h1>{pageTitle}</h1>
              <p>
                {path === "/blue-team" || path.endsWith("/ai-agent")
                  ? "Your AI assistant, protected by x402 Guardian."
                  : red
                    ? "Test deterministic payment security with controlled adversarial inputs."
                    : "Trusted user intent, independently validated payment data, and a complete audit trail."}
              </p>
            </div>
            <button
              className="refresh-button"
              onClick={load}
              aria-label="Refresh workspace"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {!path.startsWith("/archive-disabled") ? (<TestnetWorkspace path={path} />) : !state ? (
            <div className="loading-state">
              <div className="skeleton skeleton-hero" />
              <p>
                {error
                  ? "Connection failed. Retry above."
                  : "Loading persistent simulations…"}
              </p>
            </div>
          ) : (
            <>
              {(path === "/blue-team" || path === "/blue-team/ai-agent") && (
                <PurchasingAgent
                  state={state}
                  simulation={simulation}
                  busy={busy}
                  execute={execute}
                  select={select}
                  red={() => navigate("/red-team")}
                  refresh={load}
                />
              )}
              {path === "/red-team" && (
                <RedDashboard
                  state={state}
                  attack={(id) => {
                    select(id);
                    navigate(`/red-team/attack-builder?simulation=${id}`);
                  }}
                  results={() => navigate("/red-team/results")}
                />
              )}
              {(path === "/red-team/attack-lab" ||
                path === "/red-team/attack-builder") && (
                <RedAttack
                  state={state}
                  simulation={simulation}
                  busy={busy}
                  execute={execute}
                  select={select}
                  blue={() => navigate("/blue-team/ai-agent")}
                  builder={path.endsWith("/attack-builder")}
                />
              )}
              {path === "/blue-team/security-policies" && (
                <GuardianPolicies state={state} busy={busy} execute={execute} />
              )}
              {(path === "/blue-team/payment-monitor" ||
                path === "/blue-team/security-logs") && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        {path.endsWith("logs")
                          ? "Simulation audit trail"
                          : "Purchase history"}
                      </h2>
                      <p>
                        Choose a simulation to inspect its persisted decisions
                        and ledger result.
                      </p>
                    </div>
                    <span className="subtle-label">
                      {state.simulations.length} stored
                    </span>
                  </div>
                  <SimulationHistory
                    simulations={state.simulations}
                    select={select}
                    selected={simulation?.id}
                  />
                  {simulation && (
                    <div className="current-purchase">
                      <PurchaseFacts simulation={simulation} />
                      <SimulationDecision simulation={simulation} />
                      <JsonPanel
                        label="Trusted authorization and merchant input"
                        value={{
                          authorization: simulation.authorization,
                          original: simulation.original,
                          modified: simulation.modified,
                          signings: simulation.signings,
                          transfer: simulation.transfer,
                        }}
                      />
                      <SimulationTimeline simulation={simulation} />
                    </div>
                  )}
                </>
              )}
              {path === "/blue-team/anti-drainer" && (
                <>
                  <section className="surface">
                    <div className="section-heading">
                      <div>
                        <h2>Signing permissions</h2>
                        <p>
                          Only exact, user-approved payments can reach the
                          isolated signer.
                        </p>
                      </div>
                      <span className="status block">
                        Contract signing disabled
                      </span>
                    </div>
                    {[
                      [
                        "ERC-20 unlimited approvals",
                        "approve(address,uint256) calldata is decoded. Unknown spenders and unlimited allowances are rejected.",
                      ],
                      [
                        "Permit and Permit2 requests",
                        "Supported test-envelope domains, token, spender, and allowance fields are inspected. No typed-data signing permission is granted.",
                      ],
                      [
                        "Unapproved contract interactions",
                        "The purchasing agent has no contract-call capability. All such requests are blocked.",
                      ],
                      [
                        "Approval binding",
                        "Every test proof is bound to the exact guard decision, trusted purchase, policy version, and payment fields.",
                      ],
                    ].map(([h, p]) => (
                      <div className="setting-row" key={h}>
                        <div>
                          <strong>{h}</strong>
                          <p>{p}</p>
                        </div>
                        <Shield size={17} />
                      </div>
                    ))}
                  </section>
                  <Notice>
                    This is simulated signing protection, not a live wallet
                    allowance scanner or a production Permit/Permit2 signature
                    verifier.
                  </Notice>
                  {state.simulations
                    .filter((s) =>
                      s.attacks.some((a) => a.category === "contract_approval"),
                    )
                    .map((s) => (
                      <div className="current-purchase" key={s.id}>
                        <h2>
                          {s.resource.name} · {s.id.slice(0, 8)}
                        </h2>
                        <SimulationDecision simulation={s} />
                      </div>
                    ))}
                </>
              )}
              {path === "/red-team/results" && legacy && (
                <>
                  <section className="recent-section">
                    <div className="section-heading">
                      <div>
                        <h2>Shared simulation results</h2>
                        <p>
                          Attack delivery and attacker objectives are separate
                          from the defender decision.
                        </p>
                      </div>
                    </div>
                    <SimulationHistory
                      simulations={state.simulations.filter(
                        (s) => s.decisions.length,
                      )}
                      select={select}
                      selected={simulation?.id}
                    />
                    {simulation && (
                      <div className="current-purchase">
                        <SimulationDecision simulation={simulation} />
                        <a
                          className="button"
                          href={`/api/simulations/${simulation.id}/export`}
                        >
                          Download simulation evidence{" "}
                          <ArrowUpRight size={14} />
                        </a>
                        <SimulationTimeline simulation={simulation} />
                      </div>
                    )}
                  </section>
                  <section className="recent-section">
                    <h2>Guard assessment reports</h2>
                    <Reports data={legacy} inspect={setReport} />
                  </section>
                </>
              )}
              {path === "/red-team/guard-testing" && legacy && (
                <>
                  <Notice>
                    External adapter framework: x402-guard/1 only.
                    Organizer-specific integration is not yet validated.
                    Register only operator-approved targets; results reflect
                    actual responses, errors, or timeouts.
                  </Notice>
                  <Lab
                    page="Guard Testing"
                    data={legacy}
                    target={target}
                    setTarget={setTarget}
                    selected={categories}
                    setSelected={setCategories}
                    busy={busy}
                    run={() =>
                      execute(
                        () =>
                          api("/attacks/run-batch", {
                            guardId: target,
                            categories: categories.length
                              ? categories
                              : undefined,
                          }),
                        "Guard assessment recorded.",
                      )
                    }
                    navigate={(p) =>
                      p === "Security Reports"
                        ? navigate("/red-team/results")
                        : navigate("/red-team")
                    }
                    register={() => setRegister(true)}
                    inspect={setReport}
                    custom={() => navigate("/red-team/attack-builder")}
                  />
                </>
              )}
              {path === "/platform/blockchain-tracing" && (
                <Intelligence
                  page="Blockchain Tracing"
                  navigate={() => navigate("/blue-team/payment-monitor")}
                />
              )}
              {path === "/platform/scam-reports" && (
                <Intelligence
                  page="Scam Reports"
                  navigate={() => navigate("/blue-team/payment-monitor")}
                />
              )}
              {path === "/platform/exchange-response" && (
                <Intelligence
                  page="Exchange Response"
                  navigate={() => navigate("/blue-team/payment-monitor")}
                />
              )}
              {path === "/platform/integrations" && <Integrations />}
            </>
          )}
          <footer>
            <span>
              <Shield size={13} />
              x402 Red/Blue
            </span>
            <span>Persistent simulation ledger · No real funds or private keys</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {report && (
        <Dialog
          title="Guard assessment report"
          onClose={() => setReport(undefined)}
        >
          <ReportDetails report={report} />
        </Dialog>
      )}
      {register && (
        <Dialog
          title="Register an authorized external guard"
          onClose={() => setRegister(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await execute(
                () =>
                  api("/guards", {
                    name: f.get("name"),
                    endpoint: f.get("endpoint"),
                    adapterVersion: "x402-guard/1",
                    ...(f.get("authenticationReference")
                      ? {
                          authenticationReference: f.get(
                            "authenticationReference",
                          ),
                        }
                      : {}),
                  }),
                "Guard registered. Connection not yet tested.",
              );
              if (result) setRegister(false);
            }}
          >
            <label>
              Guard name
              <input name="name" required />
            </label>
            <label>
              Approved HTTPS endpoint
              <input name="endpoint" type="url" required />
            </label>
            <label>
              Authentication secret reference (optional)
              <input
                name="authenticationReference"
                placeholder="GUARD_SECRET_TEAM_NAME"
                pattern="GUARD_SECRET_[A-Z0-9_]+"
              />
              <small>
                Server environment variable name only. Never enter the secret
                value.
              </small>
            </label>
            <Notice>
              Supports the documented x402-guard/1 adapter. The organizer
              contract must be implemented and validated separately if it
              differs.
            </Notice>
            <button className="primary" disabled={busy}>
              Register guard
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}

