import React from "react";
import { EPOCH, virtualTime } from "./shared";
export function Inspector({
  purchase,
  record,
}: {
  purchase?: any;
  record?: any;
}) {
  const p = purchase;
  const events = p?.events || record?.events || [];
  const decisions = p?.decisions || record?.decisions || [];
  return (
    <details className="sim-inspector">
      <summary>View technical details & execution trace</summary>
      <div className="sim-inspector-body">
        <p className="sim-warning">
          SIMULATED execution. References do not exist on public Base Sepolia.
        </p>
        {p && (
          <>
            <h3>Trusted user authorization</h3>
            <pre>
              {JSON.stringify(
                p.authorization || { status: "Not yet authorized" },
                null,
                2,
              )}
            </pre>
            <h3>Exact x402 transport and payloads</h3>
            {p.attempts?.map((a: any) => (
              <details key={a.id}>
                <summary>
                  Attempt {a.key} · {a.state}
                </summary>
                <h4>Original input</h4>
                <pre>{JSON.stringify(a.original, null, 2)}</pre>
                <h4>Submitted modified input</h4>
                <pre>{JSON.stringify(a.modified, null, 2)}</pre>
                <h4>Serialized HTTP headers</h4>
                <pre>{JSON.stringify(a.headers, null, 2)}</pre>
                <h4>Facilitator verification</h4>
                <pre>
                  {JSON.stringify(
                    a.verification || { status: "Not reached" },
                    null,
                    2,
                  )}
                </pre>
                <h4>Result</h4>
                <pre>{JSON.stringify(a.result, null, 2)}</pre>
              </details>
            ))}
            <h3>Signing authorizations & signature scheme</h3>
            <pre>{JSON.stringify(p.signings, null, 2)}</pre>
            <h3>Settlement & transaction receipts</h3>
            <pre>
              {JSON.stringify(
                { settlements: p.settlements, transactions: p.transactions },
                null,
                2,
              )}
            </pre>
          </>
        )}
        {decisions.length > 0 && (
          <>
            <h3>Guardian rule evidence</h3>
            {decisions.map((d: any) => (
              <details key={d.id}>
                <summary>
                  {d.stage} · {d.decision} · {d.ruleVersion}
                </summary>
                {(
                  d.rules ||
                  record?.rules?.filter((r: any) => r.decisionId === d.id) ||
                  []
                ).map((r: any) => (
                  <div className="sim-rule" key={r.ruleId}>
                    <strong>
                      {r.status} · {r.ruleId}
                    </strong>
                    <p>{r.explanation}</p>
                    <pre>
                      {JSON.stringify(
                        {
                          evaluated: r.evaluated,
                          expected: r.expected,
                          evidence: r.evidenceRef,
                          version: r.version,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                ))}
              </details>
            ))}
          </>
        )}
        <h3>Authoritative execution timeline</h3>
        <ol className="sim-timeline">
          {events.map((e: any) => (
            <li key={e.id}>
              <small>
                {virtualTime(e.timestamp)} · {e.actor}
              </small>
              <strong>{e.type.replaceAll("_", " ")}</strong>
              <details>
                <summary>Event evidence</summary>
                <pre>
                  {JSON.stringify(
                    {
                      eventId: e.id,
                      simulationId: e.environmentId,
                      purchaseId: e.purchaseId,
                      sequence: e.sequence,
                      relatedId: e.relatedId,
                      metadata: e.metadata,
                      previousHash: e.previousHash,
                      integrity: e.integrity,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
