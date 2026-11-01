import React, { useState } from "react";
import { type SimulationState, type GuardianPolicy } from "../simulation-model";
import { Notice } from "../components/ui";
import { api } from "../api";
export function GuardianPolicies({
  state,
  busy,
  execute,
}: {
  state: SimulationState;
  busy: boolean;
  execute: <T>(
    fn: () => Promise<T>,
    message?: string,
  ) => Promise<T | undefined>;
}) {
  const [policy, setPolicy] = useState<GuardianPolicy>(state.policy.config);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !policy.enabled &&
          !window.confirm(
            "Disable Guardian? New purchase authorizations will be blocked.",
          )
        )
          return;
        await execute(
          () => api("/blue/guardian-policies", policy),
          "Guardian policy version saved.",
        );
      }}
    >
      <div className="section-heading">
        <div>
          <h2>Purchasing guard policy</h2>
          <p>
            Version {state.policy.version} · confirmed user authorization always
            applies independently.
          </p>
        </div>
        <button className="primary" disabled={busy}>
          Save guardian policy
        </button>
      </div>
      <Notice>
        These are the purchasing workflow policies. The legacy guard assessment
        engine retains its independent test policies. Amounts use exact USDC
        base units.
      </Notice>
      <div className="settings-section">
        <div>
          <h2>Spending permissions</h2>
          <p>
            The user-approved amount and recipient cannot be increased by
            merchant content or Red Team.
          </p>
        </div>
        <div className="form-grid">
          {[
            { key: "maxPayment", label: "Maximum per purchase" },
            { key: "dailyLimit", label: "Daily spending limit" },
            { key: "sessionLimit", label: "Mock wallet session limit" },
          ].map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                pattern="[0-9]+"
                required
                value={String(policy[f.key as keyof GuardianPolicy])}
                onChange={(e) =>
                  setPolicy({ ...policy, [f.key]: e.target.value })
                }
              />
            </label>
          ))}
          <label>
            Guardian enabled
            <select
              value={String(policy.enabled)}
              onChange={(e) =>
                setPolicy({ ...policy, enabled: e.target.value === "true" })
              }
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled · block new purchases</option>
            </select>
          </label>
          <label>
            Allowed network
            <input readOnly value={policy.allowedNetwork} />
          </label>
          <label>
            Allowed token
            <input
              value={policy.allowedAsset}
              required
              pattern="0x[0-9a-fA-F]{40}"
              onChange={(e) =>
                setPolicy({ ...policy, allowedAsset: e.target.value })
              }
            />
          </label>
        </div>
      </div>
      <Notice>
        Contract signing is disabled for this purchasing agent. Unlimited
        approval, unknown spender, Permit, Permit2, and unapproved contract
        requests are rejected by the signer guard.
      </Notice>
    </form>
  );
}
