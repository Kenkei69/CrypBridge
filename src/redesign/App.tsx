import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  FileText,
  FlaskConical,
  Menu,
  MessageCircle,
  Network,
  PanelLeftClose,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  User,
  Wallet,
  X,
} from "lucide-react";
import {
  History,
  live,
  initialize,
  units,
  shorten,
  lab,
  loadRuntime,
  apiPrefix,
} from "./api";
import { Chat } from "./Chat";
import { WorkspacePages } from "./Pages";
const nav = [
  ["Chat", "/blue-team/ai-agent", MessageCircle],
  ["Purchases", "/blue-team/purchases", ShoppingBag],
  ["Payments", "/blue-team/payment-monitor", CreditCard],
  ["Tracking", "/platform/blockchain-tracing", Network],
  ["Reports", "/platform/scam-reports", FileText],
  ["Account", "/account", User],
  ["Settings", "/settings", Settings],
] as const;
export type AppData = {
  mode: "simulation" | "testnet";
  labState: any;
  status: any;
  balance: any;
  history: History;
  notifications: any[];
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
  navigate: (path: string) => void;
};
export function CrypBridgeApp() {
  const [mode, setMode] = useState<"simulation" | "testnet">("simulation"),
    [labState, setLabState] = useState<any>();
  const [path, setPath] = useState(
      location.pathname === "/" ? "/blue-team/ai-agent" : location.pathname,
    ),
    [drawer, setDrawer] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [status, setStatus] = useState<any>(),
    [balance, setBalance] = useState<any>(),
    [history, setHistory] = useState<History>({
      intents: [],
      decisions: [],
      transfers: [],
    }),
    [notifications, setNotifications] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [inbox, setInbox] = useState(false),
    [copied, setCopied] = useState(false),
    [chatKey, setChatKey] = useState(0);
  const red = path.startsWith("/red-team"),
    navRef = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLButtonElement>(null);
  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setPath(new URL(to, location.origin).pathname);
    setDrawer(false);
    setInbox(false);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const pop = () => {
      setPath(location.pathname);
      setDrawer(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await initialize(red);
      const runtime = await loadRuntime();
      setMode(runtime.mode);
      const results = await Promise.allSettled([
        live("/status"),
        live("/balance"),
        live<History>("/history"),
        live<any[]>("/notifications"),
        runtime.mode === "simulation" ? lab("/state") : Promise.resolve(null),
      ]);
      setStatus(results[0].status === "fulfilled" ? results[0].value : null);
      setBalance(results[1].status === "fulfilled" ? results[1].value : null);
      if (results[2].status === "fulfilled") setHistory(results[2].value);
      if (results[3].status === "fulfilled") setNotifications(results[3].value);
      if (results[4].status === "fulfilled") setLabState(results[4].value);
      const failure = results.find((r) => r.status === "rejected");
      setError(failure?.status === "rejected" ? failure.reason.message : "");
    } catch (e) {
      setStatus(null);
      setBalance(null);
      setError(e instanceof Error ? e.message : "Cannot connect to CrypBridge");
    } finally {
      setLoading(false);
    }
  }, [red]);
  useEffect(() => {
    let events: EventSource | undefined,
      stopped = false;
    let eventRefresh: ReturnType<typeof setTimeout> | undefined;
    let balanceChanged = false,
      opened = false,
      connectionError = false;
    void refresh().then(() => {
      if (stopped) return;
      events = new EventSource(
        apiPrefix() +
          "/events?after=" +
          (sessionStorage.getItem("crypbridge-event-cursor") || "0"),
      );
      events.onmessage = (e) => {
        sessionStorage.setItem("crypbridge-event-cursor", e.lastEventId);
        const notification = JSON.parse(e.data);
        if (
          [
            "payment.confirmed",
            "watched.received",
            "watched.sent",
            "PAYMENT_SUCCESSFUL",
          ].includes(notification.type)
        )
          balanceChanged = true;
        setNotifications((old) =>
          [
            notification,
            ...old.filter(
              (n) =>
                n.sequence !== notification.sequence ||
                n.environmentId !== notification.environmentId,
            ),
          ]
            .sort((a, b) => b.sequence - a.sequence)
            .slice(0, 50),
        );
        // Coalesce replayed server events into one history read, not one per event.
        if (!eventRefresh)
          eventRefresh = setTimeout(() => {
            eventRefresh = undefined;
            if (balanceChanged && !stopped) {
              balanceChanged = false;
              void live("/balance")
                .then(setBalance)
                .catch(() => setBalance(null));
            }
            if (!stopped && apiPrefix() === "/api/lab")
              void lab("/state")
                .then(setLabState)
                .catch(() => {});
            if (!stopped)
              void live<History>("/history")
                .then(setHistory)
                .catch(() => {});
          }, 150);
      };
      events.onerror = () => {
        connectionError = true;
        setStatus((s: any) =>
          s
            ? {
                ...s,
                guardian: { status: "connection interrupted", enabled: false },
              }
            : s,
        );
      };
      events.addEventListener("reset", () => {
        void refresh();
        setChatKey((k) => k + 1);
      });
      events.onopen = () => {
        if (!opened && !connectionError) {
          opened = true;
          return;
        }
        opened = true;
        connectionError = false;
        void live("/status")
          .then(setStatus)
          .catch(() => setStatus(null));
      };
    });
    return () => {
      stopped = true;
      events?.close();
      if (eventRefresh) clearTimeout(eventRefresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!drawer) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    Array.from(
      navRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href]",
      ) || [],
    )
      .find((el) => el.getClientRects().length > 0)
      ?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawer(false);
      }
      if (e.key === "Tab") {
        const els = Array.from(
          navRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href]",
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    window.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", keys);
      menuRef.current?.focus();
    };
  }, [drawer]);
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth > 900) setDrawer(false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const data: AppData = {
    mode,
    labState,
    status,
    balance,
    history,
    notifications,
    error,
    loading,
    refresh,
    navigate,
  };
  const chat =
    path === "/" || path === "/blue-team" || path === "/blue-team/ai-agent";
  const guardian = status?.guardian?.enabled === true && !status?.rpc?.error;
  const address = balance?.address || status?.wallets?.buyer;
  function newChat() {
    if (mode === "simulation")
      localStorage.removeItem("crypbridge-sim-active-" + status?.environmentId);
    else localStorage.removeItem("crypbridge-active-chat");
    setChatKey((k) => k + 1);
    navigate("/blue-team/ai-agent");
  }
  return (
    <div className={`cb-app ${collapsed ? "cb-collapsed" : ""}`}>
      <a href="#workspace" className="cb-skip">
        Skip to workspace
      </a>
      {drawer && (
        <button
          className="cb-overlay"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className={`cb-sidebar ${drawer ? "is-open" : ""}`}
        ref={navRef}
        aria-label="Main navigation"
      >
        <div className="cb-brand">
          <a
            href="/blue-team/ai-agent"
            onClick={(e) => {
              e.preventDefault();
              navigate("/blue-team/ai-agent");
            }}
            aria-label="CrypBridge home"
          >
            <Shield size={37} strokeWidth={1.9} />
            <span>
              <b>Cryp</b>Bridge
            </span>
          </a>
          <button
            className="cb-icon cb-desktop-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            className="cb-icon cb-mobile-close"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          >
            <X size={20} />
          </button>
        </div>
        <button className="cb-new-chat" aria-label="New Chat" onClick={newChat}>
          <Plus size={20} />
          <span>New Chat</span>
        </button>
        <nav>
          {nav.map(([label, to, Icon]) => {
            const selected =
              label === "Chat"
                ? chat
                : label === "Payments"
                  ? path === to || path.endsWith("security-logs")
                  : path === to;
            return (
              <a
                key={label}
                href={to}
                title={collapsed ? label : undefined}
                className={selected ? "active" : ""}
                aria-current={selected ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(to);
                }}
              >
                <Icon size={21} strokeWidth={1.8} />
                <span>{label}</span>
              </a>
            );
          })}
        </nav>
        <div className="cb-sidebar-bottom">
          <a
            aria-label={red ? "Back to Blue Team" : "Red Team workspace"}
            className={`cb-team-link ${red ? "selected" : ""}`}
            href="/red-team"
            onClick={(e) => {
              e.preventDefault();
              navigate(red ? "/blue-team/ai-agent" : "/red-team");
            }}
          >
            <FlaskConical size={16} />
            <span>{red ? "Back to Blue Team" : "Red Team workspace"}</span>
            <ArrowUpRight size={14} />
          </a>
          <div className="cb-wallet-network">
            <span
              className={`cb-dot ${status?.rpc && !status.rpc.error ? "" : "muted"}`}
            />
            <span>Base Sepolia</span>
            <small>{mode === "simulation" ? "SIMULATED" : "Testnet"}</small>
          </div>
          <div className="cb-wallet">
            <div className="cb-wallet-balances">
              <span className="cb-coin">$</span>
              <div>
                {loading && !balance ? (
                  <span className="cb-skeleton cb-balance-skeleton" />
                ) : (
                  <strong>
                    {balance
                      ? `${units(balance.usdcAtomic)} USDC`
                      : "Balance unavailable"}
                  </strong>
                )}
                <small>
                  {balance
                    ? `${units(balance.ethWei, 18)} ${mode === "simulation" ? "simulated ETH" : "test ETH"}`
                    : address
                      ? mode === "simulation"
                        ? "Virtual ledger unavailable"
                        : "Unable to read live balances"
                      : "Wallet not connected"}
                </small>
              </div>
            </div>
            <div className="cb-wallet-address">
              <Wallet size={15} />
              <span title={address}>{shorten(address)}</span>
              <button
                className="cb-icon"
                disabled={!address}
                aria-label={copied ? "Address copied" : "Copy wallet address"}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(address);
                    setCopied(true);
                  } catch {
                    setError(
                      "Clipboard unavailable. Copy the full address from Account.",
                    );
                  }
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      </aside>
      <div className="cb-workspace" inert={drawer}>
        <header className="cb-topbar">
          <div className="cb-header-left">
            <button
              ref={menuRef}
              className="cb-icon cb-menu"
              aria-label="Open navigation"
              aria-expanded={drawer}
              onClick={() => {
                if (window.matchMedia("(min-width: 901px)").matches)
                  setCollapsed(false);
                else setDrawer(true);
              }}
            >
              <Menu size={22} />
            </button>
            <button
              className="cb-network"
              onClick={() => navigate("/account")}
              title="View connected network"
            >
              <span className="cb-dot" />
              Base Sepolia
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="cb-header-right">
            <button
              className={`cb-guardian ${guardian ? "healthy" : ""}`}
              onClick={() => navigate("/blue-team/security-policies")}
            >
              <ShieldCheck size={16} />
              <span>
                Guardian:{" "}
                {loading && !status
                  ? "Checking"
                  : guardian
                    ? "ON"
                    : "Unavailable"}
              </span>
            </button>
            <div className="cb-notification-wrap">
              <button
                className="cb-icon cb-bell"
                aria-label="Notifications"
                aria-expanded={inbox}
                onClick={() => setInbox(!inbox)}
              >
                <Bell size={20} />
                {notifications.length > 0 && <i />}
              </button>
              {inbox && (
                <section className="cb-inbox" aria-label="Notification inbox">
                  <div className="cb-section-heading">
                    <h3>Notifications</h3>
                    <button
                      className="cb-icon"
                      aria-label="Close notifications"
                      onClick={() => setInbox(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {notifications.length ? (
                    notifications.slice(0, 8).map((n) => (
                      <article key={n.sequence}>
                        <strong>{n.type.replaceAll(".", " ")}</strong>
                        <small>{new Date(n.createdAt).toLocaleString()}</small>
                        {n.data?.error && <p>{n.data.error}</p>}
                      </article>
                    ))
                  ) : (
                    <p className="cb-muted">No notifications yet.</p>
                  )}
                </section>
              )}
            </div>
            <button
              className="cb-avatar"
              aria-label="Open account"
              onClick={() => navigate("/account")}
            >
              <User size={23} />
            </button>
          </div>
        </header>
        {mode === "simulation" && (
          <div className="sim-global-banner">
            SIMULATION ENVIRONMENT · Financial activity and blocks are virtual.
            No real funds.
          </div>
        )}
        <main
          id="workspace"
          className={chat ? "cb-main cb-chat-main" : "cb-main"}
        >
          {chat ? (
            <Chat key={chatKey} data={data} />
          ) : (
            <WorkspacePages path={path} data={data} />
          )}
        </main>
        <footer className="cb-footer">
          {mode === "simulation"
            ? "SIMULATION · No real funds or public blockchain transactions"
            : "Base Sepolia Testnet · Test tokens have no monetary value"}
        </footer>
      </div>
    </div>
  );
}
