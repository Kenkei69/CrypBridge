import React from "react";
import { ArrowRight, FlaskConical, Check, Clock } from "lucide-react";
import type { SimulationState } from "../simulation-model";
import { attackWindowOpen } from "../simulation-model";
import { units, short, date } from "../model";
import { Empty } from "../components/ui";
export function RedDashboard({
  state,
  attack,
  results,
}: {
  state: SimulationState;
  attack: (id: string) => void;
  results: () => void;
}) {
  const pending = state.simulations.filter(attackWindowOpen);
  return (
    <>
      <div className="red-intro">
        <span className="hero-icon">
          <FlaskConical size={25} />
        </span>
        <div>
          <h2>Automatic attack simulations</h2>
          <p>
            Configure and arm a scenario before the payment arrives. A matching
            authorized test purchase triggers it automatically.
          </p>
        </div>
      </div>
      <button className="primary" onClick={() => attack("")}>
        Configure and arm attack <ArrowRight size={15} />
      </button>
      <section>
        {((state as any).attackPlans || []).map((p: any) => (
          <div className="red-history-item" key={p.id}>
            <strong>{p.category.replaceAll("_", " ")}</strong>
            <span>
              {p.status}
              {p.status === "ARMED" ? " — Waiting for matching payment" : ""}
            </span>
            <small>
              Delivery: {p.result?.delivery || "pending"} · Guardian:{" "}
              {p.result?.decision || "pending"} · Objective:{" "}
              {p.result?.objective || "pending"}
            </small>
          </div>
        ))}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Recent attack history</h2>
            <p>
              Delivery, defender decisions, and attacker objectives are separate
              outcomes.
            </p>
          </div>
          <button className="text-button" onClick={results}>
            View results <ArrowRight size={14} />
          </button>
        </div>
        {state.simulations
          .flatMap((s) => s.attacks.map((a) => ({ s, a })))
          .sort((a, b) => b.a.createdAt.localeCompare(a.a.createdAt))
          .slice(0, 8)
          .map(({ s, a }) => (
            <div className="red-history-item" key={a.id}>
              <span>
                <strong>{a.category.replaceAll("_", " ")}</strong>
                <small>
                  {s.id.slice(0, 8)} · {s.resource.name} · {date(a.createdAt)}
                </small>
              </span>
              <span>
                Delivered: {a.deliveryStatus}
                <small>
                  Guardian: {a.defenderDecision || "pending"} · Objective:{" "}
                  {a.objective}
                </small>
              </span>
            </div>
          ))}
      </section>
    </>
  );
}
