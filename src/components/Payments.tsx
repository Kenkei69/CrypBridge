import React from "react";
import { ArrowUpRight } from "lucide-react";
import { type Payment, type State, units, short, date, title } from "../model";
import { Status, Empty } from "./ui";
export function Payments({
  payments,
  data,
  inspect,
}: {
  payments: Payment[];
  data: State;
  inspect: (p: Payment) => void;
}) {
  if (!payments.length)
    return (
      <Empty title="No matching payments">
        Try another search or run a payment demonstration in Settings.
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction / agent</th>
            <th>Service</th>
            <th>Amount</th>
            <th>Recipient</th>
            <th>Decision</th>
            <th>Risk</th>
            <th>Timestamp</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>
                <button className="table-link" onClick={() => inspect(p)}>
                  {p.id.slice(0, 8)}
                </button>
                <small>
                  {data.agents.find((a) => a.id === p.agentId)?.name ||
                    "Unknown agent"}
                </small>
              </td>
              <td>
                <span className="service-name">
                  {p.envelope.service
                    ? new URL(p.envelope.service).hostname
                    : "Unspecified service"}
                </span>
                <small>
                  {p.mode === "mock" ? "Payment" : title(p.mode)}
                </small>
              </td>
              <td className="tabular">
                {units(p.amount)} <span className="muted">USDC</span>
              </td>
              <td className="mono">
                {short(p.envelope.payment.accepted.payTo)}
              </td>
              <td>
                <Status decision={p.decision} />
              </td>
              <td className="tabular">
                {p.risk}
                <span className="muted"> / 100</span>
              </td>
              <td>
                <time>{date(p.createdAt)}</time>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Inspect payment ${p.id.slice(0, 8)}`}
                  onClick={() => inspect(p)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
