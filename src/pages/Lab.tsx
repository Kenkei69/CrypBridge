import React, { useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  FlaskConical,
  Play,
  SlidersHorizontal,
  ScanLine,
  ChartNoAxesCombined,
  Plus,
  Check,
  Shield,
  ChevronDown,
  Lock,
} from "lucide-react";
import { ActivityList, Empty, Notice, JsonPanel } from "../components/ui";
import {
  scenarios,
  filterScenarios,
  type State,
  type Page,
  type Report,
} from "../model";
interface Props {
  page: Page;
  data: State;
  target: string;
  setTarget: (s: string) => void;
  selected: string[];
  setSelected: (s: string[]) => void;
  busy: boolean;
  run: () => void;
  navigate: (p: Page) => void;
  register: () => void;
  inspect: (r: Report) => void;
  custom: () => void;
}
export function Lab({
  page,
  data,
  target,
  setTarget,
  selected,
  setSelected,
  busy,
  run,
  navigate,
  register,
  inspect,
  custom,
}: Props) {
  const [query, setQuery] = useState("");
  const [showScenarios, setShowScenarios] = useState(page !== "Red Team Lab");
  const ref = useRef<HTMLDivElement>(null);
  const visible = filterScenarios(data.categories, query);
  const isLab = page === "Red Team Lab";
  const guard = data.guards.find((g) => g.id === target);
  const last = data.reports.find((r) => r.guardId === target);
  function reveal() {
    setShowScenarios(true);
    setTimeout(
      () =>
        ref.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        }),
      20,
    );
  }
  function select(category: string) {
    setSelected(
      selected.includes(category)
        ? selected.filter((s) => s !== category)
        : [...selected, category],
    );
  }
  return (
    <>
      {isLab && (
        <>
          <section className="lab-hero" aria-labelledby="hero-title">
            <div className="hero-icon">
              <FlaskConical size={25} strokeWidth={1.6} />
            </div>
            <h2 id="hero-title">What would you like to test today?</h2>
            <p>
              Run attack scenarios against wallet guards and analyze their
              responses.
            </p>
            <form
              className="command-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                reveal();
              }}
            >
              <Search size={21} />
              <input
                aria-label="Search attack scenarios"
                placeholder="Search attack scenarios..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowScenarios(true);
                }}
              />
              <button aria-label="Show matching attack scenarios" type="submit">
                <ArrowRight size={19} />
              </button>
            </form>
            <div className="scenario-chips">
              {[
                { label: "Overpayment", category: "overpayment" },
                { label: "Wrong Party", category: "wrong_party" },
                { label: "Prompt Injection", category: null },
                { label: "Duplicate Payment", category: "replay" },
                { label: "Contract Drainer", category: null },
              ].map((chip) => (
                <button
                  key={chip.label}
                  className={
                    chip.category && selected.includes(chip.category)
                      ? "selected"
                      : ""
                  }
                  aria-pressed={
                    chip.category ? selected.includes(chip.category) : undefined
                  }
                  title={
                    chip.category
                      ? "Select " + chip.label
                      : chip.label + " is not implemented"
                  }
                  onClick={() => {
                    if (chip.category) {
                      select(chip.category);
                      setQuery("");
                    } else setQuery(chip.label);
                    reveal();
                  }}
                >
                  {chip.label}
                  {!chip.category && <span className="chip-soon">Planned</span>}
                </button>
              ))}
            </div>
            <span className="hero-note">
              <Lock size={12} /> Controlled mock tests. No real wallet payments.
            </span>
          </section>
          <div className="quick-actions">
            {[
              {
                title: "Run Simulation",
                description: "Execute a predefined attack scenario.",
                icon: Play,
                tone: "blue",
                action: () => navigate("Attack Simulator"),
              },
              {
                title: "Custom Attack",
                description: "Configure a controlled attack payload.",
                icon: SlidersHorizontal,
                tone: "lavender",
                action: custom,
              },
              {
                title: "Test External Guard",
                description: "Test an authorized external guard.",
                icon: ScanLine,
                tone: "peach",
                action: () => navigate("Guard Testing"),
              },
              {
                title: "View Results",
                description: "Review execution history and findings.",
                icon: ChartNoAxesCombined,
                tone: "mint",
                action: () => navigate("Security Reports"),
              },
            ].map((item) => (
              <button
                className="quick-action"
                key={item.title}
                onClick={item.action}
              >
                <span className={`quick-icon ${item.tone}`}>
                  <item.icon size={20} strokeWidth={1.7} />
                </span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <ArrowUpRight size={16} className="quick-arrow" />
              </button>
            ))}
          </div>
        </>
      )}
      <section className="testing-workflow" ref={ref}>
        <div className="section-heading">
          <div>
            <h2>
              {page === "Guard Testing"
                ? "Evaluate a guard"
                : "Your testing workspace"}
            </h2>
            <p>
              {page === "Guard Testing"
                ? "Choose a target and compare its responses with the expected outcomes."
                : "Choose a guard, select scenarios, and run a controlled assessment."}
            </p>
          </div>
          <span className="subtle-label">
            <span className="dot" /> Mock tests only
          </span>
        </div>
        <div className="target-toolbar">
          <label className="target-field">
            <Shield size={18} />
            <span className="sr-only">Target guard</span>
            <select
              aria-label="Target guard"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {data.guards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={register}>
            <Plus size={16} />
            Register guard
          </button>
          <div className="toolbar-spacer" />
          <button
            onClick={() => setShowScenarios((v) => !v)}
            aria-expanded={showScenarios}
          >
            {selected.length ? `${selected.length} selected` : "All scenarios"}
            <ChevronDown size={14} />
          </button>
          <button className="primary" disabled={busy || !target} onClick={run}>
            <Play size={15} />
            {busy ? "Running assessment…" : "Run assessment"}
          </button>
        </div>
        {page === "Guard Testing" && (
          <div className="guard-context">
            <div>
              <span className="muted">Target type</span>
              <strong>
                {guard?.endpoint.startsWith("builtin:")
                  ? "Built-in demo guard"
                  : "Registered external guard"}
              </strong>
            </div>
            <div>
              <span className="muted">Connection status</span>
              <strong>
                {guard?.endpoint.startsWith("builtin:")
                  ? "In-process adapter"
                  : last
                    ? "Previously tested · see results"
                    : "Not tested"}
              </strong>
            </div>
            <div>
              <span className="muted">Latest assessment</span>
              <strong>
                {last
                  ? `${last.score}/100 · ${last.results.results.length} tests`
                  : "No assessment yet"}
              </strong>
            </div>
          </div>
        )}
        {!isLab && (
          <div className="compact-search">
            <Search size={17} />
            <input
              aria-label="Filter scenarios"
              placeholder="Filter scenarios…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowScenarios(true);
              }}
            />
            <button className="text-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        )}
        {showScenarios && (
          <div className="scenario-selection">
            <div className="selection-summary">
              <span>
                {visible.length} available scenario
                {visible.length === 1 ? "" : "s"}
                {selected.length ? ` · ${selected.length} selected` : ""}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setSelected([]);
                  setQuery("");
                }}
              >
                Reset
              </button>
            </div>
            {visible.length ? (
              <div className="scenario-grid">
                {visible.map((c) => (
                  <button
                    key={c}
                    aria-pressed={selected.includes(c)}
                    className={`scenario-option ${selected.includes(c) ? "selected" : ""}`}
                    onClick={() => select(c)}
                  >
                    <span className="scenario-check">
                      {selected.includes(c) ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                    </span>
                    <div>
                      <strong>{scenarios[c]?.label || c}</strong>
                      <p>{scenarios[c]?.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="No available scenarios match">
                {["prompt injection", "contract drainer"].includes(
                  query.toLowerCase(),
                )
                  ? "This category is planned and has no simulation backend yet. Select an available scenario to run a test."
                  : "Try overpayment, recipient, token, or duplicate payment."}
                <button onClick={() => setQuery("")}>
                  Show available scenarios
                </button>
              </Empty>
            )}
          </div>
        )}
        {page === "Attack Simulator" && (
          <div className="custom-prompt">
            <SlidersHorizontal size={18} />
            <div>
              <strong>Need to inspect a specific payment?</strong>
              <p>
                Configure a mock payload using the existing validation engine.
              </p>
            </div>
            <button onClick={custom}>
              Configure payload <ArrowUpRight size={14} />
            </button>
          </div>
        )}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Recent activity</h2>
            <p>
              Stored assessment results, with guard decisions and test outcomes
              shown separately.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("Security Reports")}
          >
            View all results <ArrowRight size={15} />
          </button>
        </div>
        <ActivityList reports={data.reports} onInspect={inspect} />
      </section>
      {page === "Guard Testing" && (
        <>
          <Notice>
            External tests use only operator-approved HTTPS endpoints.
            Registration does not verify connectivity; connection errors appear
            in the assessment results.
          </Notice>
          <JsonPanel
            label="Guard adapter response contract"
            value={{
              decision: "block",
              risk_score: 95,
              reason: "Payment exceeds configured maximum",
            }}
          />
        </>
      )}
    </>
  );
}
