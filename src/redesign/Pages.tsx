import {SimulationPages} from '../simulation/SimulationPages';
export function WorkspacePages({path,data}:{path:string;data:AppData}){return data.mode==="simulation"?<SimulationPages path={path} data={data}/>:<LiveWorkspacePages path={path} data={data}/>;}
import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  FlaskConical,
  LoaderCircle,
  MessageCircle,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { AppData } from "./App";
import {
  Intent,
  Transfer,
  live,
  units,
  shorten,
  explorer,
  stateLabel,
  readLocal,
} from "./api";
function LiveWorkspacePages({
  path,
  data,
}: {
  path: string;
  data: AppData;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [verification, setVerification] = useState<any>(),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [cases, setCases] = useState<any>(),
    [caseError, setCaseError] = useState(""),
    [attack, setAttack] = useState<any>(),
    [selected, setSelected] = useState<Intent>(),
    [showCase, setShowCase] = useState(false),
    [copied, setCopied] = useState(false);
  const red = path.startsWith("/red-team"),
    tracking = path.includes("blockchain-tracing"),
    reports = path.includes("scam-reports") || path === "/reports",
    purchases = path.endsWith("purchases"),
    payments =
      path.includes("payment-monitor") || path.includes("security-logs"),
    account = path === "/account",
    settings =
      path === "/settings" ||
      path.includes("security-policies") ||
      path.includes("anti-drainer");
  useEffect(() => {
    setError("");
    setVerification(undefined);
    setQuery("");
    setSelected(undefined);
    let stopped = false;
    void (async () => {
      try {
        if (tracking) {
          const t = await live<Transfer[]>("/transfers");
          if (!stopped) setTransfers(t);
        }
        if (reports) {
          try {
            const c = await live("/cases");
            if (!stopped) {
              setCases(c);
              setCaseError("");
            }
          } catch (e) {
            if (!stopped)
              setCaseError(
                e instanceof Error
                  ? e.message
                  : "Investigation access unavailable",
              );
          }
        }
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [path, data.history]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const title = red
    ? "Red Team workspace"
    : tracking
      ? "Tracking"
      : reports
        ? "Reports"
        : purchases
          ? "Purchases"
          : payments
            ? "Payments"
            : account
              ? "Account"
              : settings
                ? "Settings"
                : "Workspace";
  const subtitle = red
    ? "Controlled attacks. Real Guardian decisions."
    : tracking
      ? "Follow genuine USDC transfers on Base Sepolia."
      : reports
        ? "Report suspicious activity with verifiable on-chain evidence."
        : purchases
          ? "Your purchases, approvals and protected resources."
          : payments
            ? "Verify a payment and review your on-chain history."
            : account
              ? "Your dedicated testnet wallet and connection details."
              : settings
                ? "Payment protection, connection status and conversations."
                : "This feature is not available in the current deployment.";
  return (
    <div className="cb-page">
      <div className="cb-page-heading">
        <div>
          <p className="cb-eyebrow">
            {red ? "SECURITY TESTING" : "YOUR WORKSPACE"}
          </p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button
          className="cb-icon cb-refresh"
          disabled={busy || data.loading}
          aria-label="Refresh workspace"
          onClick={() => void data.refresh()}
        >
          <RefreshCw size={18} className={data.loading ? "cb-spin" : ""} />
        </button>
      </div>
      {error && (
        <p className="cb-inline-error" role="alert">
          {error}
        </p>
      )}
      {data.error && !error && (
        <p className="cb-inline-error" role="alert">
          {data.error}
        </p>
      )}
      {(purchases || payments) && (
        <>
          {payments && (
            <section className="cb-panel cb-verification">
              <h2>Verify a transaction or address</h2>
              <p className="cb-muted">
                Read directly from Base Sepolia. Only USDC transfers are
                decoded.
              </p>
              <form
                className="cb-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () =>
                    setVerification(
                      await live(
                        "/verify?query=" + encodeURIComponent(query.trim()),
                      ),
                    ),
                  );
                }}
              >
                <div className="cb-search-input">
                  <Search size={18} />
                  <input
                    aria-label="Transaction hash or wallet address"
                    placeholder="Transaction hash or wallet address"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    required
                    pattern="0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{64}"
                  />
                </div>
                <button className="cb-primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={16} className="cb-spin" />
                  ) : (
                    "Verify"
                  )}
                </button>
              </form>
              {verification && (
                <div className="cb-verified-result">
                  <span className="cb-status">
                    {verification.kind === "address"
                      ? "Address read"
                      : verification.status}
                  </span>
                  {verification.kind === "address" ? (
                    <dl>
                      <div>
                        <dt>USDC balance</dt>
                        <dd>{units(verification.usdcAtomic)} USDC</dd>
                      </div>
                      <div>
                        <dt>Test ETH balance</dt>
                        <dd>{units(verification.ethWei, 18)} ETH</dd>
                      </div>
                    </dl>
                  ) : (
                    <>
                      <p>
                        {verification.confirmations} confirmations · Block{" "}
                        {verification.blockNumber}
                      </p>
                      <a
                        href={explorer(verification.hash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on BaseScan
                        <ArrowUpRight size={14} />
                      </a>
                      {verification.transfers.length ? (
                        verification.transfers.map((t: any) => (
                          <p key={t.logIndex}>
                            {units(t.amount)} USDC · {shorten(t.sender)} →{" "}
                            {shorten(t.recipient)}
                          </p>
                        ))
                      ) : (
                        <p>No USDC Transfer events in this transaction.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          <section className="cb-panel cb-table-panel">
            <div className="cb-section-heading">
              <h2>{purchases ? "Purchase history" : "Payment history"}</h2>
              <span className="cb-count">{data.history.intents.length}</span>
            </div>
            {data.loading && !data.history.intents.length ? (
              <Skeleton />
            ) : data.history.intents.length ? (
              <div className="cb-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>
                        <span className="cb-sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.intents.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <strong>
                            {i.requirements?.resource?.description ||
                              "AI Security Research Report"}
                          </strong>
                          <small>{new URL(i.resource).host}</small>
                        </td>
                        <td>{units(i.amount)} USDC</td>
                        <td>
                          <span className="cb-status">
                            {i.error?.startsWith("Cancelled")
                              ? "Cancelled"
                              : stateLabel(i.state)}
                          </span>
                        </td>
                        <td>{new Date(i.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            className="cb-table-link"
                            onClick={() =>
                              setSelected(selected?.id === i.id ? undefined : i)
                            }
                          >
                            Details
                            <ArrowUpRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                icon={Wallet}
                title="No payments yet"
                text="Your approved requests and verified transactions will appear here."
              />
            )}
          </section>
          {selected && (
            <section className="cb-panel">
              <div className="cb-section-heading">
                <h2>Payment details</h2>
                <button
                  className="cb-table-link"
                  onClick={() => setSelected(undefined)}
                >
                  Close
                </button>
              </div>
              <dl className="cb-details">
                <div>
                  <dt>Product</dt>
                  <dd>{selected.requirements?.resource?.description}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{units(selected.amount)} USDC</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>Base Sepolia</dd>
                </div>
                <div>
                  <dt>Sender</dt>
                  <dd className="cb-address">{selected.buyer}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd className="cb-address">{selected.payTo}</dd>
                </div>
                <div>
                  <dt>Guardian</dt>
                  <dd>
                    {(() => {
                      const d = data.history.decisions.find(
                        (d) => d.intentId === selected.id,
                      );
                      return d
                        ? d.allowed
                          ? "Checks passed"
                          : d.rules.join(", ")
                        : "Not evaluated";
                    })()}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{stateLabel(selected.state)}</dd>
                </div>
              </dl>
              {selected.error && (
                <p className="cb-payment-reason">{selected.error}</p>
              )}
              {selected.txHash && (
                <a
                  className="cb-tx-link"
                  href={explorer(selected.txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selected.txHash}
                  <ArrowUpRight size={14} />
                </a>
              )}
              {selected.state === "AWAITING_APPROVAL" && (
                <div className="cb-receipt-buttons">
                  <button
                    className="cb-primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setSelected(
                          await live(`/intents/${selected.id}/approve`, {
                            approve: true,
                          }),
                        );
                        await data.refresh();
                      })
                    }
                  >
                    Approve & Pay
                  </button>
                  <button
                    className="cb-secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setSelected(
                          await live(`/intents/${selected.id}/cancel`, {}),
                        );
                        await data.refresh();
                      })
                    }
                  >
                    Cancel
                  </button>
                </div>
              )}
            </section>
          )}
          {payments && (
            <TransferTable
              transfers={data.history.transfers}
              title="Wallet transfers"
            />
          )}
        </>
      )}
      {tracking && (
        <>
          <form
            className="cb-search-form cb-tracking-search"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () =>
                setTransfers(
                  await live<Transfer[]>(
                    "/transfers" +
                      (query.trim()
                        ? "?address=" + encodeURIComponent(query.trim())
                        : ""),
                  ),
                ),
              );
            }}
          >
            <div className="cb-search-input">
              <Search size={18} />
              <input
                aria-label="Filter tracked wallet"
                placeholder="Filter by wallet address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                pattern="0x[0-9a-fA-F]{40}"
              />
            </div>
            <button className="cb-primary" disabled={busy}>
              Search transfers
            </button>
          </form>
          <TransferTable transfers={transfers} title="Indexed USDC transfers" />
          <p className="cb-page-note">
            Confirmed transfer relationships are on-chain evidence, not proof of
            stolen-fund ownership. Indexed history only; other chains, bridges
            and swaps are not supported.
          </p>
          <section className="cb-panel cb-monitor-status">
            <Network size={20} />
            <div>
              <h3>Persistent blockchain monitor</h3>
              <p>
                {data.status?.checkpoint
                  ? `Next block: ${data.status.checkpoint.nextBlock} · Last checkpoint: ${new Date(data.status.checkpoint.updatedAt).toLocaleString()}`
                  : "No verified checkpoint available."}
              </p>
            </div>
          </section>
        </>
      )}
      {reports && (
        <>
          <div className="cb-section-heading">
            <h2>Investigation cases</h2>
            <button
              className="cb-primary"
              onClick={() => setShowCase(!showCase)}
            >
              {showCase ? "Close form" : "New report"}
            </button>
          </div>
          {caseError && (
            <p className="cb-access-notice">
              <Shield size={18} />
              {caseError}
            </p>
          )}
          {showCase && (
            <section className="cb-panel">
              <h2>Report suspicious activity</h2>
              <form
                className="cb-case-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await live("/cases", {
                      txHash: f.get("txHash"),
                      suspect: f.get("suspect"),
                      description: f.get("description"),
                      evidence: f.get("evidence") || "",
                      network: "eip155:84532",
                    });
                    setCases(await live("/cases"));
                    setShowCase(false);
                  });
                }}
              >
                <label>
                  Transaction hash
                  <input
                    name="txHash"
                    required
                    pattern="0x[0-9a-fA-F]{64}"
                    placeholder="0x…"
                  />
                </label>
                <label>
                  Suspected wallet
                  <input
                    name="suspect"
                    required
                    pattern="0x[0-9a-fA-F]{40}"
                    placeholder="0x…"
                  />
                </label>
                <label>
                  Incident description
                  <textarea
                    name="description"
                    required
                    maxLength={4000}
                    rows={3}
                  />
                </label>
                <label>
                  Supporting evidence
                  <textarea name="evidence" maxLength={16000} rows={2} />
                </label>
                <p className="cb-muted">
                  The backend validates the transaction and its USDC evidence
                  before creating a case.
                </p>
                <button className="cb-primary" disabled={busy}>
                  Validate & submit report
                </button>
              </form>
            </section>
          )}
          {cases?.cases?.length
            ? cases.cases.map((c: any) => (
                <section className="cb-panel" key={c.id}>
                  <h3>Case {c.id.slice(0, 8)}</h3>
                  <p>{c.description}</p>
                  <a href={explorer(c.txHash)} target="_blank" rel="noreferrer">
                    View source transaction
                    <ArrowUpRight size={14} />
                  </a>
                  <TransferTable
                    transfers={cases.transfers.filter((t: Transfer) =>
                      cases.edges.some(
                        (edge: any) =>
                          edge.caseId === c.id && edge.transferId === t.id,
                      ),
                    )}
                    title="Confirmed transfer relationships"
                  />
                </section>
              ))
            : !caseError && (
                <Empty
                  icon={FileText}
                  title="No reports yet"
                  text="Validated reports and their investigation evidence will appear here."
                />
              )}
        </>
      )}
      {red && (
        <>
          <div className="cb-team-notice">
            <FlaskConical size={19} />
            <p>
              Isolated test inputs use the same Guardian as checkout. These
              tests do not sign or settle payments.
            </p>
          </div>
          <section className="cb-panel">
            <h2>Choose an attack scenario</h2>
            <div className="cb-attack-list">
              {[
                [
                  "overpayment",
                  "Overpayment",
                  "Increase the untrusted requested amount.",
                ],
                [
                  "wrong-recipient",
                  "Wrong recipient",
                  "Replace the merchant recipient address.",
                ],
                [
                  "prompt-injection",
                  "Prompt injection",
                  "Attempt to authorize an extra payment through merchant content.",
                ],
                [
                  "duplicate",
                  "Duplicate payment",
                  "Replay a consumed purchase authorization.",
                ],
                [
                  "token-approval",
                  "Unauthorized contract signing",
                  "Request an unsupported permit or token approval.",
                ],
              ].map(([category, label, description]) => (
                <button
                  key={category}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setAttack(await live("/attacks", { category }));
                      await data.refresh();
                    })
                  }
                >
                  <Shield size={20} />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </section>
          {attack && (
            <section className="cb-panel cb-attack-result" aria-live="polite">
              <span className="cb-status">
                {attack.allowed ? "Allowed by Guardian" : "Blocked by Guardian"}
              </span>
              <h2>{attack.attack?.replaceAll("-", " ")}</h2>
              <p>
                {attack.rules.length
                  ? attack.rules.join(" · ")
                  : "All deterministic checks passed."}
              </p>
              <small>
                Decision {attack.id} · No signing or settlement requested.
              </small>
            </section>
          )}
          <section className="cb-panel">
            <h2>Security decisions</h2>
            {data.history.decisions.filter((d) => d.attack).length ? (
              data.history.decisions
                .filter((d) => d.attack)
                .slice(0, 15)
                .map((d) => (
                  <div className="cb-decision-row" key={d.id}>
                    <ShieldCheck size={18} />
                    <strong>{d.attack?.replaceAll("-", " ")}</strong>
                    <span>{d.allowed ? "Allowed" : "Blocked"}</span>
                    <small>{d.rules.join(", ")}</small>
                  </div>
                ))
            ) : (
              <Empty
                icon={Shield}
                title="No test results yet"
                text="Run a controlled scenario to see the actual Guardian decision."
              />
            )}
          </section>
        </>
      )}
      {account && (
        <>
          <section className="cb-panel cb-account-wallet">
            <span className="cb-large-icon">
              <Wallet size={28} />
            </span>
            <h2>
              {data.status?.wallets?.buyer
                ? "Connected testnet wallet"
                : "Wallet disconnected"}
            </h2>
            <p className="cb-muted">Buyer wallet · Base Sepolia</p>
            <p className="cb-full-address">
              {data.balance?.address ||
                data.status?.wallets?.buyer ||
                "Configure a dedicated buyer wallet in server secrets."}
            </p>
            <button
              className="cb-secondary"
              disabled={!data.status?.wallets?.buyer}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(
                    data.status.wallets.buyer,
                  );
                  setCopied(true);
                })
              }
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied ? "Copied" : "Copy address"}
            </button>
            <div className="cb-account-balances">
              <div>
                <small>USDC balance</small>
                <strong>
                  {data.balance
                    ? `${units(data.balance.usdcAtomic)} USDC`
                    : "Unavailable"}
                </strong>
              </div>
              <div>
                <small>Test ETH balance</small>
                <strong>
                  {data.balance
                    ? `${units(data.balance.ethWei, 18)} ETH`
                    : "Unavailable"}
                </strong>
              </div>
            </div>
          </section>
          <section className="cb-panel">
            <h2>Wallet connection</h2>
            <p className="cb-muted">
              This application uses the configured server signer. Wallet
              credentials are managed through server secrets. Browser wallet
              connection is not supported by this deployment.
            </p>
            <dl className="cb-details">
              <div>
                <dt>Merchant</dt>
                <dd className="cb-address">
                  {data.status?.wallets?.merchant || "Not configured"}
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>Base Sepolia · 84532</dd>
              </div>
              <div>
                <dt>Token</dt>
                <dd className="cb-address">
                  {data.status?.rpc?.token || "Contract validation unavailable"}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
      {settings && (
        <>
          <section className="cb-panel">
            <div className="cb-section-heading">
              <h2>Guardian protection</h2>
              <span className="cb-status">
                {data.status?.guardian?.enabled ? "Operational" : "Unavailable"}
              </span>
            </div>
            <p className="cb-muted">
              Deterministic checks bind every signature to your approved amount,
              recipient, token, network and authorization expiry.
            </p>
            <dl className="cb-details">
              <div>
                <dt>Maximum payment</dt>
                <dd>1 USDC</dd>
              </div>
              <div>
                <dt>Eight-hour user limit</dt>
                <dd>5 USDC</dd>
              </div>
              <div>
                <dt>24-hour wallet limit</dt>
                <dd>10 USDC</dd>
              </div>
              <div>
                <dt>Signing method</dt>
                <dd>USDC EIP-3009 only</dd>
              </div>
            </dl>
            <p className="cb-page-note">
              These server-enforced policies cannot be disabled from the
              frontend.
            </p>
          </section>
          <section className="cb-panel">
            <h2>Connections</h2>
            <dl className="cb-details">
              <div>
                <dt>Base Sepolia RPC</dt>
                <dd>
                  {data.status?.rpc && !data.status.rpc.error
                    ? "Connected"
                    : data.status?.rpc?.error || "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>x402 facilitator</dt>
                <dd>
                  {data.status?.facilitator && !data.status.facilitator.error
                    ? "Compatible capabilities discovered"
                    : data.status?.facilitator?.error || "Unavailable"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="cb-panel">
            <h2>Saved conversations</h2>
            <p className="cb-muted">
              Chat text is saved in this browser. Payment authorizations and
              history persist on the server.
            </p>
            {readLocal<any[]>("crypbridge-conversations", []).map((c) => (
              <button
                className="cb-conversation-link"
                key={c.id}
                onClick={() => {
                  localStorage.setItem(
                    "crypbridge-active-chat",
                    JSON.stringify(c),
                  );
                  data.navigate("/blue-team/ai-agent");
                }}
              >
                <MessageCircle size={18} />
                <span>{c.turns[0]?.text}</span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </section>
        </>
      )}
      {!red &&
        !tracking &&
        !reports &&
        !purchases &&
        !payments &&
        !account &&
        !settings && (
          <Empty
            icon={FileText}
            title="Feature unavailable"
            text="Use the sidebar to open the available CrypBridge tools."
          />
        )}
    </div>
  );
}
export function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <div className="cb-empty">
      <Icon size={28} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Skeleton() {
  return (
    <div
      className="cb-loading"
      role="status"
      aria-label="Loading payment history"
    >
      {[1, 2, 3].map((i) => (
        <div key={i} className="cb-skeleton" />
      ))}
    </div>
  );
}
export function TransferTable({
  transfers,
  title,
}: {
  transfers: Transfer[];
  title: string;
}) {
  return (
    <section className="cb-panel cb-table-panel">
      <div className="cb-section-heading">
        <h2>{title}</h2>
        <span className="cb-count">{transfers.length}</span>
      </div>
      {transfers.length ? (
        <div className="cb-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Amount</th>
                <th>From → To</th>
                <th>Block</th>
                <th>Status</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{units(t.amount)} USDC</strong>
                  </td>
                  <td>
                    <span title={t.sender}>{shorten(t.sender)}</span>
                    <span className="cb-muted"> → </span>
                    <span title={t.recipient}>{shorten(t.recipient)}</span>
                    <small>{new Date(t.timestamp).toLocaleString()}</small>
                  </td>
                  <td>{t.blockNumber}</td>
                  <td>
                    <span className="cb-status">{t.status}</span>
                  </td>
                  <td>
                    <a
                      className="cb-table-link"
                      href={explorer(t.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      title={t.txHash}
                    >
                      {shorten(t.txHash)}
                      <ArrowUpRight size={14} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Network}
          title="No indexed transfers"
          text="Only genuine USDC events from the configured blockchain index are displayed."
        />
      )}
    </section>
  );
}
