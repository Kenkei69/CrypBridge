import { api } from "../api";
import React, { useState, useEffect } from "react";
import {
  Wallet,
  Plus,
  Shield,
  ArrowUpRight,
  Lock,
  FileText,
  Download,
  ScanLine,
  Waypoints,
  Flag,
  Building2,
  ArrowRight,
  Play,
} from "lucide-react";
import {
  type State,
  type Policy,
  type WalletRecord,
  type Page,
  type Report,
  units,
  short,
  date,
} from "../model";
import { Notice, JsonPanel, Empty, ReportDetails } from "../components/ui";
export function Wallets({
  data,
  add,
  confirm,
  navigate,
}: {
  data: State;
  add: () => void;
  confirm: (w: WalletRecord) => void;
  navigate: (p: Page) => void;
}) {
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Connected wallets</h2>
          <p>Public-address configurations in the test environment</p>
        </div>
        <button className="primary" onClick={add}>
          <Plus size={16} />
          Add wallet
        </button>
      </div>
      <div className="wallet-grid">
        {data.wallets.map((w) => (
          <section className="surface wallet-card" key={w.id}>
            <div className="section-heading">
              <span className="quick-icon blue">
                <Wallet size={21} />
              </span>
              <span className="subtle-label">Test wallet</span>
            </div>
            <h2>{w.name}</h2>
            <p className="mono wallet-address">{w.address}</p>
            <div className="setting-row">
              <div>
                <strong>Payment authorization</strong>
                <p>
                  {data.policy.config.enabled
                    ? "Guard policy enabled"
                    : "Guard policy disabled globally"}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={w.enabled}
                aria-label={`Payment authorization for ${w.name}`}
                className={`switch ${w.enabled ? "on" : ""}`}
                onClick={() => confirm(w)}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <span>Network</span>
              <strong>{w.network}</strong>
            </div>
            <div className="setting-row">
              <span>Allowed token</span>
              <strong>
                USDC{" "}
                <small className="mono">
                  {short(data.policy.config.asset)}
                </small>
              </strong>
            </div>
            <div className="setting-row">
              <span>Per-payment limit</span>
              <strong>{units(data.policy.config.maxPayment)} USDC</strong>
            </div>
            <div className="setting-row">
              <span>Daily limit</span>
              <strong>{units(data.policy.config.dailyLimit)} USDC</strong>
            </div>
            <div className="setting-row">
              <span>Signing permissions</span>
              <span className="muted">Test only</span>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("Security Policies")}
            >
              Edit payment policy <ArrowUpRight size={14} />
            </button>
          </section>
        ))}
      </div>
      <section className="surface monitoring-status">
        <h2>Contract security</h2>
        <div className="setting-row">
          <div>
            <strong>Contract approval monitoring</strong>
            <p>No on-chain allowance integration is connected.</p>
          </div>
          <span className="status neutral">Not connected</span>
        </div>
        <div className="setting-row">
          <div>
            <strong>Anti-drainer protection</strong>
            <p>
              Recipient and token policies are enforced. Specialized drainer
              detection is not implemented.
            </p>
          </div>
          <span className="status neutral">Policy checks only</span>
        </div>
      </section>
      <Notice>
        No private keys, seed phrases, balances, or live signing permissions are
        collected. Test simulations cannot submit on-chain payments.
      </Notice>
    </>
  );
}
const policyLabels: Record<string, string> = {
  maxPayment: "Maximum payment",
  dailyLimit: "Daily spending limit",
  sessionLimit: "Session spending limit",
  approvalAbove: "Approval threshold",
  expectedPrice: "Expected service price",
  deviationBps: "Maximum price deviation (basis points)",
  recipient: "Trusted recipient",
  asset: "Approved token contract",
  network: "Allowed network",
  scheme: "Payment scheme",
  service: "Trusted service URL",
  enabled: "Enable guard policy",
};
export function Policies({
  data,
  busy,
  save,
}: {
  data: State;
  busy: boolean;
  save: (p: Policy) => Promise<boolean>;
}) {
  const [policy, setPolicy] = useState<Policy>(data.policy.config),
    [error, setError] = useState("");
  const [savedVersion, setSavedVersion] = useState(data.policy.version);
  return (
    <form
      className="policy-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (
          [
            "maxPayment",
            "dailyLimit",
            "sessionLimit",
            "approvalAbove",
            "expectedPrice",
          ].some((k) => !/^\d+$/.test(String(policy[k as keyof Policy])))
        ) {
          setError("Enter non-negative integer amounts in USDC base units.");
          return;
        }
        if (await save(policy)) setSavedVersion((v) => v + 1);
      }}
    >
      <div className="section-heading">
        <div>
          <h2>Guard policy</h2>
          <p>
            Version {Math.max(savedVersion, data.policy.version)} · each save
            creates an audited version
          </p>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save policy version"}
        </button>
      </div>
      <Notice>
        Amounts use exact token base units. 1,000,000 units = 1 USDC. A hard
        security block always overrides the risk score.
      </Notice>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {[
        {
          title: "Spending boundaries",
          description: "Control how much an agent can authorize.",
          keys: [
            "maxPayment",
            "dailyLimit",
            "sessionLimit",
            "approvalAbove",
            "expectedPrice",
            "deviationBps",
          ],
        },
        {
          title: "Trusted payment conditions",
          description:
            "Validate actual payment data against independently configured values.",
          keys: ["recipient", "asset", "network", "scheme", "service"],
        },
        {
          title: "Guard status",
          description:
            "Disabling the policy blocks authorization; it does not bypass the guard.",
          keys: ["enabled"],
        },
      ].map((group) => (
        <section className="settings-section" key={group.title}>
          <div>
            <h2>{group.title}</h2>
            <p>{group.description}</p>
          </div>
          <div className="form-grid">
            {group.keys.map((k) => (
              <label key={k}>
                {policyLabels[k]}
                {k === "enabled" ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={policy.enabled}
                    className={`switch ${policy.enabled ? "on" : ""}`}
                    onClick={() =>
                      setPolicy({ ...policy, enabled: !policy.enabled })
                    }
                  >
                    <span />
                  </button>
                ) : (
                  <input
                    required
                    value={String(policy[k as keyof Policy])}
                    type={
                      k === "deviationBps"
                        ? "number"
                        : k === "service"
                          ? "url"
                          : "text"
                    }
                    min={k === "deviationBps" ? 0 : undefined}
                    max={k === "deviationBps" ? 10000 : undefined}
                    inputMode={
                      [
                        "maxPayment",
                        "dailyLimit",
                        "sessionLimit",
                        "approvalAbove",
                        "expectedPrice",
                      ].includes(k)
                        ? "numeric"
                        : undefined
                    }
                    pattern={
                      [
                        "maxPayment",
                        "dailyLimit",
                        "sessionLimit",
                        "approvalAbove",
                        "expectedPrice",
                      ].includes(k)
                        ? "[0-9]+"
                        : undefined
                    }
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        [k]:
                          k === "deviationBps"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}
    </form>
  );
}
export function Reports({
  data,
  inspect,
}: {
  data: State;
  inspect: (r: Report) => void;
}) {
  return (
    <>
      <div className="guard-comparison">
        {data.guards.map((g) => {
          const r = data.reports.find((r) => r.guardId === g.id);
          return (
            <section className="surface comparison" key={g.id}>
              <ScanLine size={21} />
              <h2>{g.name}</h2>
              <div className="score">
                {r?.score ?? "—"}
                <small>/100</small>
              </div>
              <p>
                {r
                  ? `${r.results.falsePositives} false positives · ${r.results.falseNegatives} false negatives`
                  : "No assessment yet"}
              </p>
              <button
                className="text-button"
                disabled={!r}
                onClick={() => r && inspect(r)}
              >
                Inspect assessment <ArrowUpRight size={14} />
              </button>
            </section>
          );
        })}
      </div>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Assessment history</h2>
            <p>
              Test assessments · weighted security score includes benign
              acceptance
            </p>
          </div>
        </div>
        {data.reports.length ? (
          data.reports.map((r) => (
            <div className="report-row" key={r.id}>
              <button className="report-open" onClick={() => inspect(r)}>
                <span className="quick-icon lavender">
                  <FileText size={20} />
                </span>
                <span>
                  <strong>{r.guard.name}</strong>
                  <small>
                    {date(r.createdAt)} · suite {r.results.suiteVersion} ·{" "}
                    {r.results.results.length} tests
                  </small>
                </span>
                <span className="report-score">
                  {r.score}
                  <small>/100</small>
                </span>
              </button>
              <a
                className="icon-button"
                aria-label={`Download PDF report for ${r.guard.name} on ${date(r.createdAt)}`}
                href={`/api/reports/${r.id}/export?format=pdf`}
              >
                <Download size={17} />
              </a>
            </div>
          ))
        ) : (
          <Empty title="No reports yet">
            Run an assessment in the Red Team Lab.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Intelligence({
  page,
  navigate,
}: {
  page: Page;
  navigate: (p: Page) => void;
}) {
  const [incidents, setIncidents] = useState<any[]>([]),
    [issue, setIssue] = useState("");
  useEffect(() => {
    api<any[]>("/incidents")
      .then(setIncidents)
      .catch((e) => setIssue(String(e)));
  }, [page]);
  if (page === "Scam Reports")
    return (
      <section>
        <h2>Investigation center</h2>
        <p>Evidence and incident actions recorded in this test session.</p>
        {issue && <Notice>{issue}</Notice>}
        {incidents.map((i) => (
          <section className="payment-option" key={i.id}>
            <strong>
              {i.kind.replaceAll("_", " ")} · {i.status}
            </strong>
            <p>{i.simulationId}</p>
            <p>
              {i.evidence.transfer
                ? "A simulated transfer is recorded."
                : "No funds were transferred."}
            </p>
            <JsonPanel label="Complete security evidence" value={i.evidence} />
            <JsonPanel label="Response history" value={i.actions} />
          </section>
        ))}
        {!incidents.length && (
          <p>No saved incidents. Use Take Action on a blocked payment.</p>
        )}
      </section>
    );
  if (page === "Exchange Response")
    return (
      <section>
        <h2>Exchange response</h2>
        <p>
          Local test response adapter. No exchange integration is configured.
        </p>
        <button
          onClick={async () => {
            try {
              await api("/incidents/response-drill", {});
              setIncidents(await api<any[]>("/incidents"));
            } catch (e) {
              setIssue(String(e));
            }
          }}
        >
          Create simulated loss response drill
        </button>
        <p>
          Uses dedicated test accounts. Your purchasing wallet is unchanged.
        </p>
        {issue && <Notice>{issue}</Notice>}
        {incidents
          .filter((i) => i.kind === "SIMULATED_LOSS")
          .map((i) => (
            <section className="payment-option" key={i.id}>
              <strong>Simulated transfer · evidence available</strong>
              <JsonPanel label="Evidence and tracing" value={i.evidence} />
              <button
                onClick={async () => {
                  try {
                    await api(`/incidents/${i.id}/escalate`, {});
                    setIncidents(await api<any[]>("/incidents"));
                  } catch (e) {
                    setIssue(String(e));
                  }
                }}
              >
                Request test compliance escalation
              </button>
              {i.actions.map((a: any) => (
                <p key={a.id}>{a.data.message || a.kind}</p>
              ))}
            </section>
          ))}
      </section>
    );
  const content =
    page === "Blockchain Tracing"
      ? {
          icon: Waypoints,
          title: "Follow the evidence",
          description:
            "Wallet tracing is not connected yet. On-chain history, fund-flow graphs, suspicious activity detection, and evidence links require a blockchain data integration.",
          items: [
            "Wallet and network search",
            "Transaction history and fund-flow graph",
            "Suspicious activity alerts and evidence links",
          ],
        }
      : String(page) === "Scam Reports"
        ? {
            icon: Flag,
            title: "A clearer path to incident reporting",
            description:
              "Incident submission and evidence storage are not implemented. This preview shows the planned workflow; no reports are submitted or uploaded.",
            items: [
              "Blockchain and transaction details",
              "Suspected recipient address",
              "Incident description",
              "Evidence upload",
              "Review and submit",
            ],
          }
        : {
            icon: Building2,
            title: "Coordinate the next response",
            description:
              "Exchange response integrations are not connected. There are no verified alerts, partner acknowledgments, compliance reviews, or confirmed holds to display.",
            items: [
              "Submitted alerts and potential exchange destinations",
              "Evidence packages and partner acknowledgments",
              "Compliance review statuses and verified holds",
            ],
          };
  return (
    <section className="intelligence-placeholder">
      <span className="hero-icon">
        <content.icon size={26} />
      </span>
      <span className="subtle-label">
        Planned capability · frontend preview
      </span>
      <h2>{content.title}</h2>
      <p>{content.description}</p>
      <ol>
        {content.items.map((item, i) => (
          <li key={item}>
            <span>{i + 1}</span>
            {item}
          </li>
        ))}
      </ol>
      <Notice>
        No live investigation or real-world exchange action is available in this
        environment.
      </Notice>
      <button onClick={() => navigate("Payment Monitor")}>
        Review recorded payments <ArrowRight size={16} />
      </button>
    </section>
  );
}
export function Integrations() {
  return (
    <>
      <section className="settings-section">
        <div>
          <h2>Guard Adapter API</h2>
          <p>Version 1 · operator-approved HTTPS endpoints only</p>
        </div>
        <div>
          <Notice>
            Configure GUARD_ALLOWED_ORIGINS and GUARD_API_TOKEN on the server.
            Timeouts and malformed responses fail the test.
          </Notice>
          <JsonPanel
            label="Example request envelope"
            value={{
              adapter_version: "x402-guard/1",
              test_id: "uuid",
              attack_type: "overpayment",
              envelope: {
                mode: "mock",
                payment: {
                  x402Version: 2,
                  accepted: { amount: "10000000", network: "eip155:84532" },
                },
              },
              expected: { decision: "block" },
            }}
          />
          <JsonPanel
            label="Strict response contract"
            value={{
              decision: "block",
              risk_score: 95,
              reason: "Payment exceeds maximum",
            }}
          />
          <p>This is a testing contract, not an official x402 wire message.</p>
        </div>
      </section>
    </>
  );
}
export function SettingsPage({
  busy,
  demo,
}: {
  busy: boolean;
  demo: (s: string) => void;
}) {
  return (
    <>
      <section className="settings-section">
        <div>
          <h2>Guided demonstration</h2>
          <p>Run reproducible test requests through the existing guard.</p>
        </div>
        <div className="demo-list">
          {[
            {
              id: "legitimate",
              title: "Legitimate payment",
              description:
                "Check a payment that matches the trusted service conditions.",
            },
            {
              id: "overpayment",
              title: "Overpayment",
              description: "Request more than the allowed service price.",
            },
            {
              id: "wrong_party",
              title: "Wrong recipient",
              description: "Substitute the recipient address.",
            },
            {
              id: "replay",
              title: "Replay authorization",
              description: "Submit an authorization that was already consumed.",
            },
          ].map((s) => (
            <div className="setting-row" key={s.id}>
              <div>
                <strong>{s.title}</strong>
                <p>{s.description}</p>
              </div>
              <button disabled={busy} onClick={() => demo(s.id)}>
                <Play size={14} />
                Run
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Environment</h2>
          <p>Current application capabilities</p>
        </div>
        <div>
          <div className="setting-row">
            <span>Storage</span>
            <strong>PostgreSQL</strong>
          </div>
          <div className="setting-row">
            <span>Configured network</span>
            <strong>Base Sepolia</strong>
          </div>
          <div className="setting-row">
            <span>Payment mode</span>
            <span className="status neutral">Test authorizations only</span>
          </div>
          <div className="setting-row">
            <span>Live settlement</span>
            <span className="muted">Not connected</span>
          </div>
        </div>
      </section>
    </>
  );
}
