import React, { useState } from "react";
import {
  ShieldCheck,
  FlaskConical,
  Check,
  Clock,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import { type Simulation, stages, attackWindowOpen } from "../simulation-model";
import { units, date, title, short } from "../model";
import { JsonPanel, Notice, Status, Empty } from "./ui";
export function Stage({ simulation: s }: { simulation: Simulation }) {
  return (
    <span className={`simulation-stage ${s.stage.toLowerCase()}`}>
      <i />
      {s.stage === "ATTACK_WINDOW_OPEN" && !attackWindowOpen(s)
        ? "Attack window expired"
        : stages[s.stage] || s.stage}
    </span>
  );
}
export function PurchaseFacts({ simulation: s }: { simulation: Simulation }) {
  const p = s.authorization || s.proposal;
  return (
    <dl className="purchase-facts">
      <div>
        <dt>Resource</dt>
        <dd>{s.resource.name}</dd>
      </div>
      <div>
        <dt>Authorized amount</dt>
        <dd>{units(p.amount)} USDC</dd>
      </div>
      <div>
        <dt>Trusted recipient</dt>
        <dd className="mono">{short(p.recipient)}</dd>
      </div>
      <div>
        <dt>Network / asset</dt>
        <dd>{p.network} · USDC</dd>
      </div>
      <div>
        <dt>Merchant</dt>
        <dd>{s.resource.merchant.name}</dd>
      </div>
      <div>
        <dt>Simulation</dt>
        <dd className="mono">{s.id.slice(0, 12)}</dd>
      </div>
    </dl>
  );
}
export function SimulationTimeline({
  simulation: s,
}: {
  simulation: Simulation;
}) {
  return (
    <section className="timeline-section">
      <div className="section-heading">
        <div>
          <h2>Execution timeline</h2>
          <p>Persistent events from the same shared simulation.</p>
        </div>
        <span className="subtle-label">{s.events.length} events</span>
      </div>
      <ol className="simulation-timeline">
        {s.events.map((e) => (
          <li key={e.id}>
            <span className={`timeline-symbol ${e.source}`}>
              <span />
            </span>
            <div>
              <div className="timeline-title">
                <strong>{title(e.type.toLowerCase())}</strong>
                <span>
                  {e.source} · {new Date(e.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <JsonPanel
                label="Event data"
                value={{
                  simulationId: s.id,
                  timestamp: e.createdAt,
                  type: e.type,
                  source: e.source,
                  ...e.data,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function SimulationDecision({
  simulation: s,
}: {
  simulation: Simulation;
}) {
  const decision = s.decisions.at(-1),
    attack = s.attacks.at(-1);
  return (
    <>
      {decision && (
        <section className={`decision-surface ${decision.decision}`}>
          <div className="section-heading">
            <div className="decision-title">
              <ShieldCheck size={22} />
              <h2>Blue Team decision</h2>
            </div>
            <Status decision={decision.decision} />
          </div>
          <p>{decision.explanation}</p>
          {decision.rules.length > 0 && (
            <div className="rule-chips">
              {decision.rules.map((r) => (
                <code key={r}>{r}</code>
              ))}
            </div>
          )}
          <small>
            {decision.decision === "block" && s.stage !== "COMPLETED"
              ? "No payment authorization signed. No funds deducted."
              : s.stage === "COMPLETED"
                ? "The original authorized purchase was settled once in the simulation ledger."
                : "Signing and settlement remain subject to the guard."}
          </small>
        </section>
      )}
      {attack && (
        <section className="attack-result">
          <div className="section-heading">
            <h2>Attack result</h2>
            <span className="subtle-label">{title(attack.category)}</span>
          </div>
          <div className="attack-outcomes">
            <div>
              <span>Delivery</span>
              <strong>{title(attack.deliveryStatus)}</strong>
            </div>
            <div>
              <span>Attacker objective</span>
              <strong
                className={attack.objective === "failed" ? "text-success" : ""}
              >
                {title(attack.objective)}
              </strong>
            </div>
            <div>
              <span>Defender decision</span>
              <Status decision={attack.defenderDecision || "pending"} />
            </div>
          </div>
          <div className="attack-outcomes">
            <div>
              <span>Test authorization produced?</span>
              <strong>
                {s.signings.length ? "Yes · test-only proof" : "No"}
              </strong>
            </div>
            <div>
              <span>Settlement occurred?</span>
              <strong>{s.transfer ? "Yes · simulation ledger" : "No"}</strong>
            </div>
            <div>
              <span>Blue Team defense</span>
              <strong>
                {attack.objective === "failed"
                  ? "Successful"
                  : attack.objective === "succeeded"
                    ? "Bypassed"
                    : "Not concluded"}
              </strong>
            </div>
          </div>
          <small>
            {date(attack.createdAt)} · {s.id}
          </small>
          <p>{attack.reason}</p>
        </section>
      )}
      {s.delivery && (
        <section className="resource-delivery">
          <span className="quick-icon mint">
            <FileText size={21} />
          </span>
          <div>
            <h2>{s.delivery.name}</h2>
            <span className="subtle-label">
              Purchased resource · simulated delivery
            </span>
            <p>{s.delivery.content}</p>
            <small>
              Payment reference {s.delivery.ledgerEntryId} ·{" "}
              {units(s.delivery.amount)} USDC · no blockchain transaction
            </small>
          </div>
        </section>
      )}
    </>
  );
}
export function SimulationHistory({
  simulations,
  select,
  selected,
}: {
  simulations: Simulation[];
  select: (id: string) => void;
  selected?: string;
}) {
  const [limit, setLimit] = useState(12);
  return (
    <div className="simulation-history">
      {!simulations.length ? (
        <Empty title="No purchases yet">
          Start in Blue Team and request a resource from the merchant catalog.
        </Empty>
      ) : (
        simulations.slice(0, limit).map((s) => (
          <button
            key={s.id}
            className={s.id === selected ? "selected" : ""}
            onClick={() => select(s.id)}
          >
            <span className="quick-icon blue">
              <FileText size={17} />
            </span>
            <span>
              <strong>{s.resource.name}</strong>
              <small>
                {units(s.proposal.amount)} USDC · {date(s.createdAt)} ·{" "}
                {s.id.slice(0, 8)}
              </small>
            </span>
            <Stage simulation={s} />
            <ArrowUpRight size={15} />
          </button>
        ))
      )}
      {simulations.length > limit && (
        <button className="text-button" onClick={() => setLimit((n) => n + 12)}>
          Show older purchases ({simulations.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
