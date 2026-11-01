import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Shield,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Bell,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  RefreshCw,
  Search,
  Plus,
  Lock,
  AlertCircle,
  Check,
  FlaskConical,
} from "lucide-react";
import { api } from "./api";
import {
  navigation,
  type Page,
  type State,
  type WalletRecord,
  type Payment,
  type Report,
  type Policy,
  units,
  title,
} from "./model";
import {
  Dialog,
  Status,
  JsonPanel,
  Notice,
  ReportDetails,
} from "./components/ui";
import { Payments } from "./components/Payments";
import { Overview } from "./pages/Overview";
import { Lab } from "./pages/Lab";
import {
  Wallets,
  Policies,
  Reports,
  Intelligence,
  Integrations,
  SettingsPage,
} from "./pages/Management";
import "./style.css";
const descriptions: Partial<Record<Page, string>> = {
  Overview:
    "A clear view of your agent wallets, payment decisions, and security tests.",
  "Red Team Lab":
    "Test and evaluate AI agent wallet guards with controlled attack scenarios.",
  "Wallet Security":
    "Keep payment permissions clear and your agent wallets protected.",
  "Payment Monitor":
    "Follow every payment request and understand each guard decision.",
  "Security Policies":
    "Set trusted payment conditions and practical spending boundaries.",
  "Attack Simulator":
    "Run predefined scenarios or inspect a controlled mock payment.",
  "Guard Testing": "Evaluate native and authorized external wallet guards.",
  "Security Reports":
    "Understand your test coverage, findings, and guard performance.",
  "Blockchain Tracing":
    "Investigate transaction paths and organize on-chain evidence.",
  "Scam Reports":
    "Document incidents with a clear trail of supporting evidence.",
  "Exchange Response":
    "Track incident coordination and verified partner responses.",
  "API & Integrations":
    "Connect approved guard adapters to your testing workflow.",
  Settings: "Manage your environment and explore the guided demonstration.",
};
export function LegacyApp() {
  const [page, setPage] = useState<Page>("Overview"),
    [data, setData] = useState<State>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error: boolean }>(),
    [target, setTarget] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [modal, setModal] = useState<"wallet" | "guard" | "custom" | "">(""),
    [detail, setDetail] = useState<
      Payment | Report | Record<string, unknown>
    >(),
    [confirmWallet, setConfirmWallet] = useState<WalletRecord>(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [collapsed, setCollapsed] = useState(false),
    [drawer, setDrawer] = useState(false),
    [account, setAccount] = useState(false),
    [live, setLive] = useState(true);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const sidebar = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const changed = () => {
      setIsMobile(query.matches);
      if (!query.matches) setDrawer(false);
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  const navigate = useCallback((p: Page) => {
    setPage(p);
    setDrawer(false);
    setAccount(false);
    window.scrollTo({ top: 0 });
  }, []);
  const load = useCallback(async () => {
    try {
      const d = await api<State>("/state");
      setData(d);
      setTarget((t) => t || d.guards[0]?.id || "");
      setError("");
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, []);
  useEffect(() => {
    load();
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    socket.onopen = () => setLive(true);
    socket.onmessage = () => load();
    socket.onerror = () => setLive(false);
    socket.onclose = () => setLive(false);
    return () => socket.close();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.error ? 12000 : 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>(".mobile-close")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab") {
        const els = Array.from(
          sidebar.current?.querySelectorAll<HTMLElement>(
            "button:not([hidden]),a",
          ) || [],
        ).filter((el) => el.getClientRects().length);
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [drawer]);
  useEffect(() => {
    if (!account) return;
    function close(e: PointerEvent) {
      if (!accountRef.current?.contains(e.target as Node)) setAccount(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setAccount(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [account]);
  async function action<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      const result = await fn();
      await load();
      const d = result as any;
      setToast({
        text: d?.decision
          ? `${title(d.decision)} · ${d.explanation || "Decision recorded."}`
          : d?.score !== undefined
            ? `Assessment complete · ${d.score}/100. Results recorded.`
            : "Changes saved.",
        error: false,
      });
      return result;
    } catch (e) {
      setToast({
        text: e instanceof Error ? e.message : String(e),
        error: true,
      });
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const closeModal = useCallback(() => setModal(""), []),
    closeDetail = useCallback(() => setDetail(undefined), []),
    closeConfirm = useCallback(() => setConfirmWallet(undefined), []);
  async function register(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const result = await action(() =>
      api(
        modal === "wallet" ? "/wallets" : "/guards",
        modal === "wallet"
          ? { name: f.get("name"), address: f.get("address"), mode: "mock" }
          : { name: f.get("name"), endpoint: f.get("endpoint") },
      ),
    );
    if (result) closeModal();
  }
  async function runCustom(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const f = new FormData(event.currentTarget);
    const a = data.agents.find((a) => a.id === f.get("agent"));
    const w = data.wallets.find((w) => w.id === a?.walletId);
    if (!a || !w) return;
    const now = Math.floor(Date.now() / 1000);
    const amount = String(f.get("amount"));
    const recipient = String(f.get("recipient"));
    const nonce =
      "0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
    const payload = {
      agentId: a.id,
      mode: "mock",
      service: data.policy.config.service,
      payment: {
        x402Version: 2,
        accepted: {
          scheme: data.policy.config.scheme,
          network: f.get("network"),
          amount,
          asset: f.get("asset"),
          payTo: recipient,
          maxTimeoutSeconds: 60,
        },
      },
      authorization: {
        from: w.address,
        to: recipient,
        value: amount,
        validAfter: String(now - 1),
        validBefore: String(now + 60),
        nonce,
      },
      mockSignature: "isolated-demo",
    };
    const result = await action(() => api("/security/validate", payload));
    if (result) {
      closeModal();
      setDetail(result);
    }
  }
  return (
    <div
      className={`app ${collapsed ? "nav-collapsed" : ""} ${drawer ? "drawer-open" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className="sidebar"
        ref={sidebar}
        inert={isMobile && !drawer}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-top">
          <button
            className="brand"
            onClick={() => navigate("Overview")}
            aria-label="x402 Red/Blue overview"
          >
            <Shield size={29} strokeWidth={1.6} />
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
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
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
        <button
          className="new-test"
          onClick={() => navigate("Attack Simulator")}
          title="New simulation"
        >
          <Plus size={18} />
          <span>New simulation</span>
        </button>
        <nav>
          {navigation.map((group) => (
            <div className="nav-group" key={group.group}>
              <p className="nav-label">{group.group}</p>
              {group.items.map((item) => (
                <button
                  key={item.page}
                  title={item.label}
                  aria-current={page === item.page ? "page" : undefined}
                  className={`nav-item ${page === item.page ? "active" : ""}`}
                  onClick={() => navigate(item.page)}
                >
                  <item.icon size={18} strokeWidth={1.7} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-mode">
            <Lock size={14} />
            <span>Isolated mock environment</span>
          </div>
          <div className="account" ref={accountRef}>
            <button
              className="account-button"
              onClick={() => setAccount(!account)}
              aria-expanded={account}
              aria-label="Demo operator account menu"
            >
              <span className="avatar">DO</span>
              <span>
                <strong>Demo operator</strong>
                <small>Local workspace</small>
              </span>
              <ChevronDown size={15} />
            </button>
            {account && (
              <div className="account-menu">
                <p>Demo profile · no signed-in identity</p>
                <button onClick={() => navigate("Settings")}>
                  Workspace settings
                </button>
                <button onClick={() => navigate("API & Integrations")}>
                  API & integrations
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace" inert={isMobile && drawer}>
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
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <span>{page === "Security Reports" ? "Reports" : page}</span>
            </div>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <i />
              Mock Environment
            </span>
            <button
              className="icon-button"
              aria-label="View security events"
              onClick={() => {
                navigate("Payment Monitor");
                setFilter("block");
              }}
            >
              <Bell size={19} />
            </button>
            <button
              className="avatar avatar-button"
              aria-label="Open account settings"
              onClick={() => navigate("Settings")}
            >
              DO
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={load}>Retry connection</button>
            </div>
          )}
          {!live && data && (
            <Notice>
              Live updates are disconnected. Use Refresh to retrieve the latest
              stored records.
            </Notice>
          )}
          <div className="page-header">
            <div>
              <span className="eyebrow">
                {["Red Team Lab", "Attack Simulator", "Guard Testing"].includes(
                  page,
                )
                  ? "Security operations"
                  : "Your workspace"}
              </span>
              <h1>{page === "Security Reports" ? "Reports" : page}</h1>
              <p>{descriptions[page]}</p>
            </div>
            <button
              className="refresh-button"
              aria-label="Refresh workspace data"
              disabled={busy}
              onClick={async () => {
                const d = await load();
                if (d) setToast({ text: "Workspace refreshed.", error: false });
              }}
            >
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>
          {!data ? (
            <div className="loading-state" aria-live="polite">
              {error ? (
                <>
                  <AlertCircle size={28} />
                  <h2>Unable to load the workspace</h2>
                  <p>
                    Your security settings have not been changed. Retry the
                    connection above.
                  </p>
                </>
              ) : (
                <>
                  <div className="skeleton skeleton-hero" />
                  <div className="skeleton-row">
                    {[1, 2, 3, 4].map((n) => (
                      <div className="skeleton" key={n} />
                    ))}
                  </div>
                  <p>Loading your security workspace…</p>
                </>
              )}
            </div>
          ) : (
            <>
              {page === "Overview" && (
                <Overview
                  data={data}
                  navigate={navigate}
                  inspectReport={setDetail}
                  inspectPayment={setDetail}
                />
              )}
              {["Red Team Lab", "Attack Simulator", "Guard Testing"].includes(
                page,
              ) && (
                <Lab
                  key={page}
                  page={page}
                  data={data}
                  target={target}
                  setTarget={setTarget}
                  selected={selected}
                  setSelected={setSelected}
                  busy={busy}
                  run={() =>
                    action(() =>
                      api("/attacks/run-batch", {
                        guardId: target,
                        categories: selected.length ? selected : undefined,
                      }),
                    )
                  }
                  navigate={navigate}
                  register={() => setModal("guard")}
                  inspect={setDetail}
                  custom={() => {
                    navigate("Attack Simulator");
                    setModal("custom");
                  }}
                />
              )}
              {page === "Payment Monitor" && (
                <>
                  <div className="monitor-toolbar">
                    <label className="pill-search">
                      <Search size={18} />
                      <input
                        aria-label="Search payments"
                        placeholder="Search transactions, addresses, or rules…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter by payment decision"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All decisions</option>
                      <option value="approve">Allowed</option>
                      <option value="block">Blocked</option>
                      <option value="require_approval">Review</option>
                    </select>
                    <span>
                      {
                        data.payments.filter(
                          (p) =>
                            (filter === "all" || p.decision === filter) &&
                            JSON.stringify(p)
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        ).length
                      }{" "}
                      results · latest 500
                    </span>
                  </div>
                  <Payments
                    payments={data.payments.filter(
                      (p) =>
                        (filter === "all" || p.decision === filter) &&
                        JSON.stringify(p)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )}
                    data={data}
                    inspect={setDetail}
                  />
                </>
              )}
              {page === "Wallet Security" && (
                <Wallets
                  data={data}
                  add={() => setModal("wallet")}
                  confirm={setConfirmWallet}
                  navigate={navigate}
                />
              )}
              {page === "Security Policies" && (
                <Policies
                  data={data}
                  busy={busy}
                  save={async (p: Policy) => {
                    if (
                      !p.enabled &&
                      data.policy.config.enabled &&
                      !window.confirm(
                        "Disable the guard policy? All payment authorizations will be blocked until it is enabled again.",
                      )
                    )
                      return false;
                    return Boolean(
                      await action(() => api("/security/policies", p)),
                    );
                  }}
                />
              )}
              {page === "Security Reports" && (
                <Reports data={data} inspect={setDetail} />
              )}
              {[
                "Blockchain Tracing",
                "Scam Reports",
                "Exchange Response",
              ].includes(page) && (
                <Intelligence page={page} navigate={navigate} />
              )}
              {page === "API & Integrations" && <Integrations />}
              {page === "Settings" && (
                <SettingsPage
                  busy={busy}
                  demo={(s) => action(() => api("/demo/" + s, {}))}
                />
              )}
            </>
          )}
          <footer>
            <span>
              <Shield size={13} />
              x402 Red/Blue
            </span>
            <span>
              Mock authorizations only<span className="footer-dot">·</span>No
              on-chain transactions
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {confirmWallet && (
        <Dialog
          title={`${confirmWallet.enabled ? "Disable" : "Enable"} payment authorization?`}
          onClose={closeConfirm}
        >
          <p>
            {confirmWallet.enabled
              ? "New mock authorizations for this wallet will be blocked."
              : "The guard will evaluate future mock payment requests for this wallet."}
          </p>
          <Notice>
            {confirmWallet.name} · This changes mock signing permissions. No
            real funds can move.
          </Notice>
          <div className="dialog-actions">
            <button onClick={closeConfirm}>Cancel</button>
            <button
              className={confirmWallet.enabled ? "destructive" : "primary"}
              disabled={busy}
              onClick={async () => {
                const result = await action(() =>
                  api(
                    "/wallets/" + confirmWallet.id,
                    { enabled: !confirmWallet.enabled },
                    "PATCH",
                  ),
                );
                if (result) closeConfirm();
              }}
            >
              {busy
                ? "Saving…"
                : confirmWallet.enabled
                  ? "Disable authorization"
                  : "Enable authorization"}
            </button>
          </div>
        </Dialog>
      )}
      {detail && (
        <Dialog
          title={"score" in detail ? "Assessment details" : "Payment decision"}
          onClose={closeDetail}
        >
          {"score" in detail ? (
            <ReportDetails report={detail as Report} />
          ) : (
            <>
              <div className="payment-decision">
                <Status decision={String(detail.decision)} />
                <span>Risk {String(detail.risk ?? "—")} / 100</span>
                <span className="subtle-label">Mock payment</span>
              </div>
              <p>
                {String(
                  detail.explanation ||
                    ((detail as Payment).rules?.length
                      ? (detail as Payment).rules
                          .join(", ")
                          .toLowerCase()
                          .replaceAll("_", " ")
                      : "No hard security rules were triggered."),
                )}
              </p>
              {"amount" in detail && (
                <p>
                  Requested amount:{" "}
                  <strong>{units(String(detail.amount))} USDC</strong>
                </p>
              )}
              <Notice>
                This is a mock policy decision. It is not a verified signature
                or blockchain settlement.
              </Notice>
              <JsonPanel
                value={detail}
                label="Payment requirements, authorization, and rule results"
              />
            </>
          )}
        </Dialog>
      )}
      {modal && data && (
        <Dialog
          title={
            modal === "wallet"
              ? "Add a mock wallet"
              : modal === "guard"
                ? "Register an external guard"
                : "Configure a mock payment"
          }
          onClose={closeModal}
        >
          {modal === "custom" ? (
            <form onSubmit={runCustom}>
              <Notice>
                This payload calls the existing mock validation engine. It
                cannot sign or settle a real payment.
              </Notice>
              <div className="form-grid">
                <label>
                  Agent
                  <select name="agent" required>
                    {data.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount (USDC base units)
                  <input name="amount" defaultValue="100000" required />
                  <small>
                    100,000 units = 0.10 USDC. Malformed values are sent to the
                    guard for testing.
                  </small>
                </label>
                <label>
                  Recipient address
                  <input
                    name="recipient"
                    defaultValue={data.policy.config.recipient}
                    required
                  />
                </label>
                <label>
                  Token contract
                  <input
                    name="asset"
                    defaultValue={data.policy.config.asset}
                    required
                  />
                </label>
                <label>
                  Network
                  <input
                    name="network"
                    defaultValue={data.policy.config.network}
                    required
                  />
                </label>
              </div>
              <div className="dialog-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Validating…" : "Validate mock payment"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={register}>
              <p>
                {modal === "wallet"
                  ? "Configure a public address for isolated mock testing."
                  : "Register a guard at an operator-approved HTTPS endpoint."}
              </p>
              <label>
                Name
                <input
                  name="name"
                  maxLength={80}
                  placeholder={
                    modal === "wallet" ? "Research agent wallet" : "Team guard"
                  }
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                {modal === "wallet"
                  ? "Public wallet address"
                  : "Approved HTTPS endpoint"}
                <input
                  name={modal === "wallet" ? "address" : "endpoint"}
                  type={modal === "wallet" ? "text" : "url"}
                  pattern={modal === "wallet" ? "0x[0-9a-fA-F]{40}" : undefined}
                  placeholder={
                    modal === "wallet"
                      ? "0x…"
                      : "https://guard.example.com/validate"
                  }
                  required
                />
              </label>
              <Notice>
                {modal === "wallet"
                  ? "Public address only. Never enter a private key or seed phrase."
                  : "The operator must approve this origin in server configuration. Registration does not make a test request."}
              </Notice>
              <div className="dialog-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Save configuration"}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
