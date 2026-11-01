import {SimulationChat} from '../simulation/SimulationChat';
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  LoaderCircle,
  Network,
  Paperclip,
  Send,
  Shield,
  ShieldCheck,
  ShoppingCart,
  X,
} from "lucide-react";
import type { AppData } from "./App";
import { Intent, live, units, explorer, stateLabel, readLocal } from "./api";
type Turn = { id: string; text: string; intentId?: string; error?: string };
type Conversation = { id: string; turns: Turn[] };
export function Chat({data}:{data:AppData}){return data.mode==="simulation"?<SimulationChat data={data}/>:<LiveChat data={data}/>;}
function LiveChat({ data }: { data: AppData }) {
  const [conversation, setConversation] = useState<Conversation>(() =>
      readLocal("crypbridge-active-chat", {
        id: crypto.randomUUID(),
        turns: [],
      }),
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [intents, setIntents] = useState<Record<string, Intent>>({}),
    [error, setError] = useState(""),
    [audit, setAudit] = useState<Record<string, any>>({}),
    [report, setReport] = useState("");
  const input = useRef<HTMLTextAreaElement>(null),
    bottom = useRef<HTMLDivElement>(null);
  const reportDialog = useRef<HTMLElement>(null);
  const auditRequested = useRef(new Set<string>());
  const welcome = conversation.turns.length === 0;
  useEffect(() => {
    localStorage.setItem(
      "crypbridge-active-chat",
      JSON.stringify(conversation),
    );
    const saved = readLocal<Conversation[]>("crypbridge-conversations", []);
    const next = [
      conversation,
      ...saved.filter((c) => c.id !== conversation.id),
    ]
      .filter((c) => c.turns.length)
      .slice(0, 50);
    localStorage.setItem("crypbridge-conversations", JSON.stringify(next));
  }, [conversation]);
  useEffect(() => {
    setIntents((old) => {
      const next = { ...old };
      for (const i of data.history.intents) {
        if (
          !next[i.id] ||
          new Date(i.updatedAt).getTime() >=
            new Date(next[i.id].updatedAt).getTime()
        )
          next[i.id] = i;
      }
      return next;
    });
  }, [data.history]);
  useEffect(() => {
    const visible = new Set(conversation.turns.map((t) => t.intentId));
    for (const i of data.history.intents.filter(
      (x) => x.state === "BLOCKED" && visible.has(x.id),
    )) {
      if (auditRequested.current.has(i.id)) continue;
      auditRequested.current.add(i.id);
      void live(`/intents/${i.id}/audit`)
        .then((a) => setAudit((old) => ({ ...old, [i.id]: a })))
        .catch(() => auditRequested.current.delete(i.id));
    }
  }, [data.history, conversation.turns]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation.turns.length, busy]);
  useEffect(() => {
    if (!report) return;
    const previous = document.activeElement as HTMLElement;
    const close =
      reportDialog.current?.querySelector<HTMLButtonElement>("button");
    close?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReport("");
      if (e.key === "Tab") {
        e.preventDefault();
        close?.focus();
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [report]);
  async function send(turn?: Turn) {
    const text = turn?.text || message.trim();
    if (!text || busy) return;
    const t = turn || { id: crypto.randomUUID(), text };
    if (!turn) setConversation((c) => ({ ...c, turns: [...c.turns, t] }));
    setMessage("");
    setBusy(t.id);
    setError("");
    try {
      const i = await live<Intent>("/intents", {
        clientKey: t.id,
        message: text,
      });
      setIntents((old) => ({ ...old, [i.id]: i }));
      setConversation((c) => ({
        ...c,
        turns: c.turns.map((x) =>
          x.id === t.id ? { ...x, intentId: i.id, error: undefined } : x,
        ),
      }));
      await data.refresh();
    } catch (e) {
      setConversation((c) => ({
        ...c,
        turns: c.turns.map((x) =>
          x.id === t.id
            ? { ...x, error: e instanceof Error ? e.message : "Request failed" }
            : x,
        ),
      }));
    } finally {
      setBusy("");
      input.current?.focus();
    }
  }
  async function update(i: Intent, action: "approve" | "cancel" | "check") {
    setBusy(i.id);
    setError("");
    try {
      const updated = await live<Intent>(
        `/intents/${i.id}${action === "check" ? "" : "/" + action}`,
        action === "approve"
          ? { approve: true }
          : action === "cancel"
            ? {}
            : undefined,
      );
      setIntents((old) => ({ ...old, [i.id]: updated }));
      const a = await live(`/intents/${i.id}/audit`);
      setAudit((old) => ({ ...old, [i.id]: a }));
      await data.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Payment request failed. Check its status before retrying.",
      );
    } finally {
      setBusy("");
    }
  }
  async function read(i: Intent) {
    setBusy(i.id);
    try {
      const r = await fetch(`/api/live/intents/${i.id}/resource`);
      if (!r.ok) throw new Error("Unable to verify access to the report");
      setReport(await r.text());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className={`cb-chat ${welcome ? "is-welcome" : "has-conversation"}`}>
      {welcome ? (
        <div className="cb-welcome">
          <ShieldCheck
            className="cb-hero-shield"
            size={78}
            strokeWidth={1.65}
          />
          <h1>
            Buy Anything With <span>Crypto</span>
          </h1>
          <p>
            Your AI agent to safely find, verify and purchase products using
            USDC.
          </p>
          <div className="cb-quick-actions">
            <button
              onClick={() => {
                setMessage("Buy me an AI security research report for 1 USDC.");
                input.current?.focus();
              }}
            >
              <ShoppingCart />
              <h2>Buy a Product</h2>
              <p>Find and purchase with USDC.</p>
            </button>
            <button
              onClick={() =>
                data.navigate("/blue-team/payment-monitor?verify=1")
              }
            >
              <Shield />
              <h2>Verify Payment</h2>
              <p>Check a transaction or address.</p>
            </button>
            <button
              onClick={() => data.navigate("/platform/blockchain-tracing")}
            >
              <Network />
              <h2>Trace Funds</h2>
              <p>Track and analyze USDC movements.</p>
            </button>
          </div>
        </div>
      ) : (
        <div className="cb-transcript" aria-live="polite">
          <div className="cb-chat-title">
            <ShieldCheck size={21} />
            <span>AI purchasing assistant</span>
            <small>Blue Team</small>
          </div>
          {conversation.turns.map((t) => {
            const i = t.intentId
              ? intents[t.intentId] ||
                data.history.intents.find((x) => x.id === t.intentId)
              : undefined;
            return (
              <div className="cb-turn" key={t.id}>
                <div className="cb-user-message">{t.text}</div>
                {t.error && (
                  <div className="cb-inline-error" role="alert">
                    <p>{t.error}</p>
                    <button onClick={() => void send(t)} disabled={!!busy}>
                      Retry request
                    </button>
                  </div>
                )}
                {i && (
                  <article className="cb-receipt">
                    <div className="cb-receipt-heading">
                      <span className="cb-receipt-icon">
                        <ShieldCheck size={22} />
                      </span>
                      <div>
                        <small>
                          {i.state === "AWAITING_APPROVAL"
                            ? "YOUR APPROVAL REQUIRED"
                            : i.error?.startsWith("Cancelled")
                              ? "CANCELLED"
                              : stateLabel(i.state).toUpperCase()}
                        </small>
                        <h2>
                          {i.requirements?.resource?.description ||
                            "AI Security Research Report"}
                        </h2>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>Merchant</dt>
                        <dd>{new URL(i.resource).host}</dd>
                      </div>
                      <div>
                        <dt>Amount</dt>
                        <dd className="cb-amount">{units(i.amount)} USDC</dd>
                      </div>
                      <div>
                        <dt>Network</dt>
                        <dd>Base Sepolia Testnet</dd>
                      </div>
                      <div>
                        <dt>Recipient</dt>
                        <dd className="cb-address">{i.payTo}</dd>
                      </div>
                    </dl>
                    {i.state === "AWAITING_APPROVAL" && (
                      <>
                        <p className="cb-receipt-note">
                          Only this exact payment is authorized. Guardian checks
                          run before signing.
                        </p>
                        <div className="cb-receipt-buttons">
                          <button
                            className="cb-primary"
                            disabled={!!busy}
                            onClick={() => void update(i, "approve")}
                          >
                            {busy === i.id ? (
                              <LoaderCircle className="cb-spin" size={16} />
                            ) : (
                              <ShieldCheck size={16} />
                            )}
                            Approve & Pay
                          </button>
                          <button
                            className="cb-secondary"
                            disabled={!!busy}
                            onClick={() => void update(i, "cancel")}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                    {busy === i.id && (
                      <p className="cb-processing" role="status">
                        <LoaderCircle size={16} className="cb-spin" />
                        Processing securely…
                      </p>
                    )}
                    {i.error && <p className="cb-payment-reason">{i.error}</p>}
                    {i.state === "BLOCKED" && (
                      <p className="cb-receipt-note">
                        {audit[i.id]?.signing === "not_requested"
                          ? "Signing was not requested. No payment was submitted."
                          : audit[i.id]?.signing === "signed"
                            ? "Authorization signed. Check the settlement status before retrying."
                            : "Signing audit unavailable. No additional payment will be initiated."}
                      </p>
                    )}
                    {i.txHash && (
                      <a
                        className="cb-tx-link"
                        href={explorer(i.txHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {i.txHash}
                        <ArrowUpRight size={14} />
                      </a>
                    )}
                    {["RECONCILING", "CONFIRMING", "SUBMITTED"].includes(
                      i.state,
                    ) && (
                      <button
                        className="cb-secondary"
                        disabled={!!busy}
                        onClick={() => void update(i, "check")}
                      >
                        Check blockchain status
                      </button>
                    )}
                    {i.state === "CONFIRMED" && (
                      <button
                        className="cb-primary"
                        disabled={!!busy}
                        onClick={() => void read(i)}
                      >
                        Open purchased report
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                  </article>
                )}
                {t.intentId && !i && (
                  <div className="cb-receipt">
                    <p className="cb-muted">
                      {data.loading
                        ? "Loading saved payment…"
                        : "Payment details could not be loaded."}
                    </p>
                    <button
                      className="cb-secondary"
                      onClick={() => void data.refresh()}
                    >
                      Reload payment details
                    </button>
                  </div>
                )}
                {busy === t.id && (
                  <p className="cb-processing">
                    <LoaderCircle size={17} className="cb-spin" />
                    Retrieving product and merchant details…
                  </p>
                )}
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      )}
      {error && (
        <p className="cb-inline-error" role="alert">
          {error}
        </p>
      )}
      {data.error && welcome && (
        <div className="cb-connection-error" role="alert">
          {data.error}
          <button onClick={() => void data.refresh()}>Retry connection</button>
        </div>
      )}
      <div className="cb-composer-area">
        <form
          className={`cb-composer ${busy ? "is-busy" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={input}
            aria-label="Message"
            placeholder="Ask CrypBridge..."
            value={message}
            disabled={!!busy}
            maxLength={500}
            rows={2}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="cb-composer-controls">
            <button
              type="button"
              className="cb-icon"
              aria-label="Attachments unavailable"
              title="Attachments are not supported by the current merchant"
              disabled
            >
              <Paperclip size={21} />
            </button>
            <button
              className="cb-send"
              aria-label="Send message"
              disabled={!message.trim() || !!busy}
            >
              {busy ? (
                <LoaderCircle className="cb-spin" size={21} />
              ) : (
                <Send size={21} />
              )}
            </button>
          </div>
        </form>
        <p className="cb-composer-caption">
          You approve every payment. Your keys stay protected.
        </p>
      </div>
      {report && (
        <div className="cb-modal-backdrop" onClick={() => setReport("")}>
          <section
            className="cb-modal"
            ref={reportDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cb-section-heading">
              <h2 id="report-title">Purchased report</h2>
              <button
                className="cb-icon"
                aria-label="Close report"
                autoFocus
                onClick={() => setReport("")}
              >
                <X size={20} />
              </button>
            </div>
            <pre>{report}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
