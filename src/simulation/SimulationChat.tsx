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
  FileText,
} from "lucide-react";
import type { AppData } from "../redesign/App";
import { lab, units } from "../redesign/api";
import { Inspector } from "./Inspector";
import { outcome, virtualTime } from "./shared";
export function SimulationChat({ data }: { data: AppData }) {
  const environmentId = data.status?.environmentId,
    [conversation, setConversation] = useState<any>(),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [content, setContent] = useState("");
  const input = useRef<HTMLTextAreaElement>(null),
    lastSend = useRef<{ key: string; text: string } | undefined>(undefined),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!environmentId) return;
    let stopped = false;
    setConversation(undefined);
    const id = localStorage.getItem("crypbridge-sim-active-" + environmentId);
    if (id)
      void lab("/conversations/" + id)
        .then((c) => {
          if (!stopped) setConversation(c);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    return () => {
      stopped = true;
    };
  }, [environmentId]);
  useEffect(() => {
    if (conversation?.id)
      void lab("/conversations/" + conversation.id)
        .then(setConversation)
        .catch(() => {});
  }, [data.history]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [conversation?.messages?.length]);
  async function run(action: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation request failed");
    } finally {
      setBusy("");
    }
  }
  async function send() {
    const message = text.trim();
    if (!message || !environmentId || busy) return;
    await run("search", async () => {
      let c = conversation;
      if (!c) {
        c = await lab("/conversations", { clientKey: crypto.randomUUID() });
        localStorage.setItem("crypbridge-sim-active-" + environmentId, c.id);
      }
      const pending =
        lastSend.current?.text === message
          ? lastSend.current
          : { key: crypto.randomUUID(), text: message };
      lastSend.current = pending;
      setConversation(
        await lab(`/conversations/${c.id}/messages`, {
          clientKey: pending.key,
          text: message,
        }),
      );
      lastSend.current = undefined;
      setText("");
    });
  }
  async function select(message: any, product: any) {
    await run("product:" + product.id, async () => {
      setConversation(
        await lab(`/conversations/${conversation.id}/select`, {
          clientKey: message.id + ":selection",
          messageId: message.id,
          productId: product.id,
        }),
      );
    });
  }
  async function method(message: any) {
    await run("method", async () => {
      setConversation(
        await lab(`/conversations/${conversation.id}/method`, {
          clientKey: message.id + ":payment",
          messageId: message.id,
          method: "base-sepolia-usdc",
        }),
      );
      await data.refresh();
    });
  }
  async function act(purchase: any, action: string) {
    await run(purchase.id, async () => {
      await lab(
        `/purchases/${purchase.id}/${action}`,
        action === "approve" ? { approve: true } : {},
      );
      setConversation(await lab("/conversations/" + conversation.id));
      await data.refresh();
    });
  }
  const welcome = !conversation?.messages?.length;
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
          <span className="sim-mode-badge">SIMULATION · NO REAL FUNDS</span>
          <div className="cb-quick-actions">
            <button
              onClick={() => {
                setText(
                  "Buy me a research report about AI security for 1 USDC.",
                );
                input.current?.focus();
              }}
            >
              <ShoppingCart />
              <h2>Buy a Product</h2>
              <p>Find and purchase with simulated USDC.</p>
            </button>
            <button onClick={() => data.navigate("/blue-team/payment-monitor")}>
              <Shield />
              <h2>Verify Payment</h2>
              <p>Inspect a virtual payment and its evidence.</p>
            </button>
            <button
              onClick={() => data.navigate("/platform/blockchain-tracing")}
            >
              <Network />
              <h2>Trace Funds</h2>
              <p>Explore simulated ledger movements.</p>
            </button>
          </div>
        </div>
      ) : (
        <div className="cb-transcript">
          <div className="cb-chat-title">
            <ShieldCheck size={21} />
            <span>AI purchasing assistant</span>
            <small>SIMULATION · Blue Team</small>
          </div>
          {conversation.messages.map((m: any) => {
            if (m.role === "user")
              return (
                <div key={m.id} className="cb-user-message">
                  {m.content}
                </div>
              );
            const p = m.purchaseId
              ? conversation.purchases.find((p: any) => p.id === m.purchaseId)
              : null;
            const chosen = conversation.messages.some(
              (x: any) =>
                x.type === "PAYMENT_METHOD" && x.data.discoveryId === m.id,
            );
            return (
              <div key={m.id} className="sim-chat-response">
                {m.type !== "PAYMENT_RECEIPT" && <p>{m.content}</p>}
                {m.type === "PRODUCTS" && (
                  <div className="sim-product-list">
                    {m.data.products.map((product: any) => (
                      <article key={product.id}>
                        <div className="sim-product-icon">
                          <FileText size={22} />
                        </div>
                        <div>
                          <small>
                            {product.merchantName} · SIMULATED CATALOG
                          </small>
                          <h2>{product.name}</h2>
                          <p>{product.description}</p>
                          <span>
                            {units(product.amount)} USDC · Base Sepolia model
                          </span>
                          <small>Resource: {product.id}</small>
                        </div>
                        <button
                          className="cb-secondary"
                          disabled={!!busy || chosen}
                          onClick={() => void select(m, product)}
                        >
                          Select product
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                {m.type === "PAYMENT_METHOD" && (
                  <section className="cb-receipt">
                    <h2>USDC · Base Sepolia simulation</h2>
                    <p className="cb-muted">
                      {m.data.product.name} · {units(m.data.product.amount)}{" "}
                      USDC
                    </p>
                    <p className="cb-muted">
                      Available virtual balance:{" "}
                      {data.balance
                        ? units(data.balance.usdcAtomic) + " USDC"
                        : "Unavailable"}
                    </p>
                    <button
                      className="cb-primary"
                      disabled={
                        !!busy ||
                        conversation.messages.some(
                          (x: any) =>
                            x.type === "PAYMENT_RECEIPT" &&
                            x.clientKey === m.id + ":payment:receipt",
                        )
                      }
                      onClick={() => void method(m)}
                    >
                      Use simulated USDC
                    </button>
                  </section>
                )}
                {p && (
                  <PaymentCard
                    purchase={p}
                    data={data}
                    busy={busy}
                    act={act}
                    read={() =>
                      void run("report", async () => {
                        const r = await fetch(
                          "/api/lab/purchases/" + p.id + "/resource",
                        );
                        if (!r.ok)
                          throw new Error(
                            "A verified virtual settlement is required",
                          );
                        setContent(await r.text());
                      })
                    }
                  />
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
      {data.error && (
        <p className="cb-inline-error" role="alert">
          {data.error}
        </p>
      )}
      {busy === "search" && (
        <p className="cb-processing">
          <LoaderCircle className="cb-spin" size={16} />
          Searching the simulated merchant catalog…
        </p>
      )}
      <div className="cb-composer-area">
        <form
          className="cb-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Message"
            ref={input}
            placeholder="Ask CrypBridge..."
            rows={2}
            maxLength={1000}
            value={text}
            disabled={!!busy || !environmentId}
            onChange={(e) => setText(e.target.value)}
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
              className="cb-icon"
              type="button"
              disabled
              aria-label="Attachments unavailable"
            >
              <Paperclip size={21} />
            </button>
            <button
              className="cb-send"
              aria-label="Send message"
              disabled={!!busy || !text.trim() || !environmentId}
            >
              {busy ? (
                <LoaderCircle className="cb-spin" size={20} />
              ) : (
                <Send size={21} />
              )}
            </button>
          </div>
        </form>
        <p className="cb-composer-caption">
          Simulated funds only. Your approval and Guardian decisions are stored
          on the server.
        </p>
      </div>
      {content && (
        <section className="cb-panel sim-delivery">
          <div className="cb-section-heading">
            <h2>Simulated purchased resource</h2>
            <button className="cb-table-link" onClick={() => setContent("")}>
              Close report
            </button>
          </div>
          <pre>{content}</pre>
        </section>
      )}
    </div>
  );
}
export function PaymentCard({
  purchase: p,
  data,
  busy,
  act,
  read,
}: {
  purchase: any;
  data: AppData;
  busy: string;
  act: (p: any, action: string) => Promise<void>;
  read: () => void;
}) {
  const t = p.trusted,
    last = p.attempts?.at(-1),
    incident = p.incidents?.at(-1),
    failed =
      p.decisions?.flatMap((d: any) =>
        d.rules.filter((r: any) => r.status === "FAIL"),
      ) || [],
    firstTransaction = p.transactions?.find((t: any) => t.status === "SUCCESS");
  const attempted = last?.modified?.requirements?.accepts?.[0];
  return (
    <article className="cb-receipt sim-payment-card" aria-live="polite">
      <div className="cb-receipt-heading">
        <span className="cb-receipt-icon">
          <ShieldCheck size={22} />
        </span>
        <div>
          <small>
            SIMULATED PAYMENT ·{" "}
            {p.state === "AWAITING_APPROVAL"
              ? "YOUR APPROVAL REQUIRED"
              : "BACKEND VERIFIED RESULT"}
          </small>
          <h2>{outcome(p.state)}</h2>
        </div>
      </div>
      <h3>{t.productName}</h3>
      <dl>
        <div>
          <dt>Merchant</dt>
          <dd>
            {t.merchantName} <small>({t.merchantId})</small>
          </dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="cb-amount">{units(p.amount)} simulated USDC</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>Base Sepolia model · eip155:84532</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd className="cb-address">{t.recipient}</dd>
        </div>
        <div>
          <dt>Resource</dt>
          <dd className="cb-address">{t.resource}</dd>
        </div>
        {p.state === "AWAITING_APPROVAL" && (
          <div>
            <dt>Available balance</dt>
            <dd>
              {data.balance
                ? units(data.balance.usdcAtomic) + " simulated USDC"
                : "Unavailable"}
            </dd>
          </div>
        )}
      </dl>
      {p.state === "AWAITING_APPROVAL" && (
        <div className="cb-receipt-buttons">
          <button
            className="cb-primary"
            disabled={!!busy}
            onClick={() => void act(p, "approve")}
          >
            <ShieldCheck size={16} />
            Approve
          </button>
          <button
            className="cb-secondary"
            disabled={!!busy}
            onClick={() => void act(p, "reject")}
          >
            Reject
          </button>
        </div>
      )}
      {busy === p.id && (
        <p className="cb-processing" role="status">
          <LoaderCircle size={16} className="cb-spin" />
          Guardian and virtual settlement processing…
        </p>
      )}
      {p.state === "BLOCKED" && (
        <div className="sim-security-alert">
          {p.attacks?.length > 0 && (
            <p>
              <strong>Attack classification: {p.attacks[0].name}</strong>
            </p>
          )}
          <strong>
            {p.incidents?.[0]?.classification === "ATTACK_BLOCKED"
              ? "A malicious payment request was blocked."
              : "Payment authorization checks failed."}
          </strong>
          <p>
            {failed
              .map((r: any) => r.explanation)
              .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
              .slice(0, 2)
              .join(" ")}
          </p>
          <p>
            Authorized: {units(p.amount)} USDC to {t.recipient}.<br />
            Attempted:{" "}
            {attempted?.amount
              ? units(attempted.amount)
              : "invalid amount"}{" "}
            USDC to {attempted?.payTo || "invalid recipient"}.
          </p>
          <p>
            {p.signings?.length
              ? "A test-only signature exists; inspect its status."
              : "No signature created."}{" "}
            {p.transactions?.length
              ? "Inspect transaction evidence."
              : "No settlement transaction. No funds moved."}
          </p>
          {incident && (
            <>
              <small>Incident: {incident.id}</small>
              <button
                className="cb-secondary"
                onClick={() =>
                  data.navigate(
                    "/platform/scam-reports?incident=" +
                      encodeURIComponent(incident.id),
                  )
                }
              >
                Take Action
              </button>
            </>
          )}
        </div>
      )}
      {p.error && p.state !== "BLOCKED" && (
        <p className="cb-payment-reason">{p.error}</p>
      )}
      {p.state === "COMPLETED" && firstTransaction && (
        <>
          <dl>
            <div>
              <dt>Sender wallet</dt>
              <dd className="cb-address">{t.buyer}</dd>
            </div>
            <div>
              <dt>Payment ID</dt>
              <dd className="cb-address">{p.id}</dd>
            </div>
            <div>
              <dt>Virtual settlement</dt>
              <dd>
                Executed · {firstTransaction.confirmations} virtual
                confirmation(s)
              </dd>
            </div>
            <div>
              <dt>Virtual block</dt>
              <dd>{firstTransaction.blockNumber}</dd>
            </div>
            <div>
              <dt>Virtual timestamp</dt>
              <dd>{virtualTime(firstTransaction.timestamp)}</dd>
            </div>
          </dl>
          <p className="sim-reference">
            Simulation transaction reference
            <br />
            <code>{firstTransaction.reference}</code>
          </p>
          <button className="cb-primary" disabled={!!busy} onClick={read}>
            Open purchased resource
            <ArrowUpRight size={15} />
          </button>
        </>
      )}
      {p.state === "PENDING" && (
        <button
          className="cb-secondary"
          disabled={!!busy}
          onClick={() => void act(p, "reconcile")}
        >
          Reconcile virtual settlement
        </button>
      )}
      <Inspector purchase={p} />
    </article>
  );
}
