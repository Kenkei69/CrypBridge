import React from "react";
import {
  Activity,
  ShieldCheck,
  Wallet,
  Flag,
  ArrowRight,
  Check,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ActivityList, Status, Empty } from "../components/ui";
import {
  type State,
  type Page,
  type Report,
  type Payment,
  short,
} from "../model";
export function Overview({
  data,
  navigate,
  inspectReport,
  inspectPayment,
}: {
  data: State;
  navigate: (p: Page) => void;
  inspectReport: (r: Report) => void;
  inspectPayment: (p: Payment) => void;
}) {
  const enabled = data.wallets.filter(
    (w) => w.enabled && data.policy.config.enabled,
  ).length;
  const blocked = data.payments.filter((p) => p.decision === "block");
  const chart = Array.from({ length: 12 }, (_, i) => {
    const hour = new Date(Date.now() - (11 - i) * 3600000);
    const rows = data.payments.filter(
      (p) => p.createdAt.slice(0, 13) === hour.toISOString().slice(0, 13),
    );
    return {
      time: hour.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      approved: rows.filter((p) => p.decision === "approve").length,
      blocked: rows.filter((p) => p.decision === "block").length,
    };
  });
  return (
    <>
      <div className="summary-metrics">
        {[
          {
            label: "Payments evaluated",
            value: data.payments.length,
            icon: Activity,
            note: "Latest 500 stored requests",
          },
          {
            label: "Attacks blocked",
            value: blocked.length,
            icon: ShieldCheck,
            note: "Blocked payment decisions",
          },
          {
            label: "Protected wallets",
            value: enabled,
            icon: Wallet,
            note: "Wallet and policy enabled",
          },
          {
            label: "Active incidents",
            value: "—",
            icon: Flag,
            note: "Incident tracking not connected",
          },
        ].map((m) => (
          <div className="metric" key={m.label}>
            <span>
              <m.icon size={17} />
              {m.label}
            </span>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="surface chart-surface">
          <div className="section-heading">
            <div>
              <h2>Payment activity</h2>
              <p>Payment decisions over the last 12 hours</p>
            </div>
            <span className="chart-legend">
              <i />
              Allowed <i />
              Blocked
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={chart}
              margin={{ left: -24, right: 10, top: 20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4169e1" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#4169e1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#edf0f5" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "#737b8c", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#737b8c", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e9ebf0",
                  borderRadius: 12,
                  background: "#fff",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="approved"
                name="Allowed"
                stroke="#4169e1"
                strokeWidth={2}
                fill="url(#activity-fill)"
              />
              <Area
                type="monotone"
                dataKey="blocked"
                name="Blocked"
                stroke="#d57a89"
                strokeWidth={2}
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Wallet protection</h2>
              <p>Current authorization configuration</p>
            </div>
            <Wallet size={19} />
          </div>
          {data.wallets.map((w) => (
            <div className="wallet-status" key={w.id}>
              <span className="quick-icon blue">
                <Wallet size={17} />
              </span>
              <div>
                <strong>{w.name}</strong>
                <small>{short(w.address)} · test</small>
              </div>
              <span
                className={`status ${w.enabled && data.policy.config.enabled ? "approve" : "require_approval"}`}
              >
                {w.enabled && data.policy.config.enabled
                  ? "Enabled"
                  : "Disabled"}
              </span>
            </div>
          ))}
          <button
            className="text-button"
            onClick={() => navigate("Wallet Security")}
          >
            Manage wallets <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Recent security events</h2>
            <p>Requests that were blocked or sent for review</p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("Payment Monitor")}
          >
            Open payment monitor <ArrowUpRight size={15} />
          </button>
        </div>
        {data.payments
          .filter((p) => p.decision !== "approve")
          .slice(0, 4)
          .map((p) => (
            <button
              className="security-event"
              key={p.id}
              onClick={() => inspectPayment(p)}
            >
              <ShieldCheck size={18} />
              <div>
                <strong>
                  {p.rules.length
                    ? p.rules.join(", ").toLowerCase().replaceAll("_", " ")
                    : "Manual review required"}
                </strong>
                <small>{p.id.slice(0, 8)} · Payment</small>
              </div>
              <Status decision={p.decision} />
              <ArrowUpRight size={15} />
            </button>
          ))}
        {!data.payments.some((p) => p.decision !== "approve") && (
          <Empty title="No security events">
            New blocked or review decisions will appear here.
          </Empty>
        )}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Recent Red Team results</h2>
            <p>Real assessment records from the test environment</p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("Red Team Lab")}
          >
            Open lab <ArrowRight size={15} />
          </button>
        </div>
        <ActivityList
          reports={data.reports}
          onInspect={inspectReport}
          limit={4}
        />
      </section>
    </>
  );
}
