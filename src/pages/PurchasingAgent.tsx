import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import {
  ArrowUp,
  ShieldCheck,
  ArrowDown,
  Plus,
  History,
  Wallet,
  MessageSquare,
  X,
  Check,
  LoaderCircle,
  Lock,
  ExternalLink,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type { SimulationState, Simulation } from "../simulation-model";
import { attackWindowOpen } from "../simulation-model";
import type {
  Conversation,
  ChatMessage,
  ConversationSummary,
} from "../chat-model";
import { units, short, date } from "../model";
import { api } from "../api";
import { workspaceSession } from "../workspace-api";
import { Dialog, JsonPanel } from "../components/ui";
import "./chat.css";
interface Props {
  state: SimulationState;
  simulation?: Simulation;
  busy: boolean;
  execute: any;
  select: (id: string) => void;
  red: () => void;
  refresh: () => Promise<unknown>;
}
const headings: Record<string, string> = {
  PURCHASE_CARD: "Your proposed purchase",
  PAYMENT_STATUS: "Payment update",
  GUARDIAN_ANALYSIS: "Guardian analysis",
  SECURITY_ALERT: "Guardian security alert",
  TRANSACTION_BLOCKED: "Transaction blocked",
  TRANSACTION_APPROVED: "Payment approved",
  PURCHASE_COMPLETE: "Purchase complete",
  SYSTEM_ERROR: "Technical issue",
};
export function PurchasingAgent({ state, select }: Props) {
  const [conversation, setConversation] = useState<Conversation>(),
    [conversations, setConversations] = useState<ConversationSummary[]>([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false),
    [atBottom, setAtBottom] = useState(true),
    [unseen, setUnseen] = useState(false);
  const activeId = useRef(""),
    working = useRef(false),
    viewport = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    forceScroll = useRef(false),
    composer = useRef<HTMLTextAreaElement>(null),
    pending = useRef<{ text: string; key: string } | null>(null);
  const mounted = useRef(false);
  const apply = useCallback((c: Conversation) => {
    if (activeId.current !== c.id) return;
    setConversations((previous) => [
      {
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        _count: { messages: c.messages.length },
      },
      ...previous.filter((v) => v.id !== c.id),
    ]);
    setConversation((previous) =>
      previous?.id === c.id &&
      (previous.messages.at(-1)?.sequence || 0) >
        (c.messages.at(-1)?.sequence || 0)
        ? previous
        : c,
    );
  }, []);
  const fetchCurrent = useCallback(async () => {
    if (!activeId.current) return;
    try {
      const c = await api<Conversation>(`/conversations/${activeId.current}`);
      apply(c);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [apply]);
  const choose = useCallback(
    async (id: string) => {
      activeId.current = id;
      localStorage.setItem("guardian-conversation", id);
      forceScroll.current = true;
      nearBottom.current = true;
      setUnseen(false);
      setHistoryOpen(false);
      await fetchCurrent();
    },
    [fetchCurrent],
  );
  async function newConversation() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await workspaceSession("blue", true);
      const c = await api<ConversationSummary>("/conversations", {});
      await choose(c.id);
      setDraft("");
      pending.current = null;
    } catch (e) {
      setError(String(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    let stopped = false;
    (async () => {
      try {
        const list = await api<ConversationSummary[]>("/conversations");
        if (stopped) return;
        setConversations(list);
        const saved = localStorage.getItem("guardian-conversation");
        const found = list.find((c) => c.id === saved) || list[0];
        if (found) await choose(found.id);
        else await newConversation();
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [choose]);
  useEffect(() => {
    const head = state.conversationHeads?.find(
      (c) => c.id === activeId.current,
    );
    if (
      !working.current &&
      activeId.current &&
      head &&
      (!conversation ||
        new Date(head.updatedAt) > new Date(conversation.updatedAt))
    )
      fetchCurrent();
  }, [state, fetchCurrent]);
  useEffect(() => {
    const timer = setInterval(fetchCurrent, 3000);
    return () => clearInterval(timer);
  }, [fetchCurrent]);
  async function shopping(path: string, body: any) {
    if (!conversation || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await workspaceSession("blue", true);
      apply(
        await api<Conversation>(
          `/conversations/${conversation.id}/${path}`,
          body,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const last = conversation?.updatedAt;
  useLayoutEffect(() => {
    const v = viewport.current;
    if (!v) return;
    if (forceScroll.current || nearBottom.current) {
      v.scrollTop = v.scrollHeight;
      forceScroll.current = false;
      nearBottom.current = true;
      setAtBottom(true);
      setUnseen(false);
    } else setUnseen(true);
  }, [last, conversation?.id]);
  function scroll() {
    const v = viewport.current;
    if (!v) return;
    nearBottom.current = v.scrollHeight - v.scrollTop - v.clientHeight < 100;
    setAtBottom(nearBottom.current);
    if (nearBottom.current) setUnseen(false);
  }
  async function send(e?: React.SubmitEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (
      working.current ||
      !draft.trim() ||
      !conversation ||
      conversation.id !== activeId.current
    )
      return;
    const text = draft.trim();
    const id =
      pending.current?.text === text
        ? pending.current.key
        : crypto.randomUUID();
    pending.current = { text, key: id };
    working.current = true;
    setBusy(true);
    setError("");
    forceScroll.current = true;
    try {
      await workspaceSession("blue", true);
      const c = await api<Conversation>(
        `/conversations/${conversation.id}/messages`,
        { text, clientKey: id },
      );
      apply(c);
      setDraft((current) => (current.trim() === text ? "" : current));
      pending.current = null;
      const sim = c.simulations[0];
      if (sim) select(sim.id);
    } catch (e) {
      await fetchCurrent();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      working.current = false;
      setBusy(false);
      composer.current?.focus();
    }
  }
  async function action(
    simulationId: string,
    action: "approve" | "cancel" | "continue",
  ) {
    if (
      !conversation ||
      working.current ||
      conversation.id !== activeId.current
    )
      return;
    working.current = true;
    setBusy(true);
    setError("");
    forceScroll.current = true;
    try {
      await workspaceSession("blue", true);
      const c = await api<Conversation>(
        `/conversations/${conversation.id}/purchases/${simulationId}/${action}`,
        { clientKey: crypto.randomUUID() },
      );
      apply(c);
      select(simulationId);
    } catch (e) {
      await fetchCurrent();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function openHistory() {
    try {
      setConversations(await api<ConversationSummary[]>("/conversations"));
      setHistoryOpen(true);
    } catch (e) {
      setError(String(e));
    }
  }
  const balance = state.accounts.find((a) => a.id === "buyer-demo")?.balance;
  return (
    <section className="guardian-chat" aria-label="Protected purchasing chat">
      <aside className="chat-history-sidebar">
        <button onClick={newConversation} disabled={busy}>
          <Plus size={15} /> New conversation
        </button>
        {conversations.map((c) => (
          <button
            key={c.id}
            aria-current={c.id === conversation?.id}
            onClick={() => choose(c.id)}
          >
            {c.title}
          </button>
        ))}
      </aside>
      <div className="chat-topbar">
        <div className="chat-brand">
          <ShieldCheck size={21} />
          <div>
            <strong>Guardian</strong>
            <small>Protected purchasing assistant</small>
          </div>
        </div>
        <div className="chat-controls">
          <span
            className="chat-balance"
            data-testid="wallet-balance"
            data-balance={balance}
          >
            <Wallet size={14} />
            {balance ? units(balance) : "—"} USDC
            <small>Available Balance</small>
          </span>
          <button
            className="icon-button"
            aria-label="Conversation history"
            onClick={openHistory}
          >
            <History size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="New conversation"
            onClick={newConversation}
            disabled={busy}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      <div
        className="chat-transcript"
        ref={viewport}
        onScroll={scroll}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="chat-thread">
          {!conversation && !error && (
            <div className="chat-loading">Loading your conversation…</div>
          )}
          {conversation?.messages.map((m) => {
            const s = conversation.simulations.find(
              (s) => s.id === m.simulationId,
            );
            return (
              <ChatEntry
                key={m.id}
                message={m}
                simulation={s}
                busy={busy || conversation.id !== activeId.current}
                action={action}
                shopping={shopping}
              />
            );
          })}
          {error && (
            <div className="chat-transport-error" role="alert">
              <AlertCircle size={18} />
              <div>
                <strong>Connection or request issue</strong>
                <p>{error}</p>
                <small>
                  No success is assumed. Persisted server messages remain
                  authoritative.
                </small>
                <button className="text-button" onClick={fetchCurrent}>
                  Reconnect and refresh
                </button>
              </div>
            </div>
          )}
          <div className="chat-bottom-anchor" />
        </div>
      </div>
      {!atBottom && (
        <button
          className="chat-jump"
          onClick={() => {
            const v = viewport.current;
            if (v) {
              v.scrollTop = v.scrollHeight;
              nearBottom.current = true;
              setAtBottom(true);
              setUnseen(false);
            }
          }}
        >
          <ArrowDown size={14} />
          {unseen ? "New messages" : "Latest messages"}
        </button>
      )}
      <div className="chat-compose-dock">
        <form className="chat-composer" onSubmit={send}>
          <textarea
            ref={composer}
            aria-label="Message Guardian"
            placeholder="Message Guardian… ask me to buy something"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={1000}
            rows={2}
            disabled={!conversation || conversation.id !== activeId.current}
          />
          <div>
            <span>
              <Lock size={11} />
              Your approval comes first.
            </span>
            <button
              className="chat-send"
              disabled={
                busy ||
                !draft.trim() ||
                !conversation ||
                conversation.id !== activeId.current
              }
              aria-label="Send message"
            >
              {busy ? <LoaderCircle size={18} /> : <ArrowUp size={19} />}
            </button>
          </div>
        </form>
        <p className="chat-footnote">
          Guardian checks every payment. No real funds or private keys.{" "}
          <span>
            {conversation?.dialogueMode === "model_intent_adapter"
              ? "AI intent adapter · deterministic guard"
              : "Deterministic assistant"}
          </span>
        </p>
      </div>
      {historyOpen && (
        <Dialog
          title="Your conversations"
          onClose={() => setHistoryOpen(false)}
        >
          <div className="conversation-list">
            {conversations.map((c) => (
              <button key={c.id} onClick={() => choose(c.id)}>
                <MessageSquare size={17} />
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {date(c.updatedAt)} · {c._count.messages} messages
                  </small>
                </span>
                {c.id === conversation?.id && <Check size={16} />}
              </button>
            ))}
          </div>
          <button className="primary" disabled={busy} onClick={newConversation}>
            <Plus size={15} />
            New conversation
          </button>
        </Dialog>
      )}
    </section>
  );
}
function ChatEntry({
  message: m,
  simulation: s,
  busy,
  action,
  shopping,
}: {
  message: ChatMessage;
  simulation?: Simulation;
  busy: boolean;
  action: (id: string, action: "approve" | "cancel" | "continue") => void;
  shopping: (path: string, body: any) => void;
}) {
  const d = m.data,
    user = m.role === "user";
  const [incident, setIncident] = useState(false),
    [notice, setNotice] = useState("");
  const facts = (rows: any[]) => (
    <dl className="inline-purchase-facts">
      {rows
        .filter((r) => r[1] != null)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{v}</dd>
          </div>
        ))}
    </dl>
  );
  async function respond(kind: string) {
    try {
      const result: any = await api(`/incidents/${s?.id}/actions`, { kind });
      setNotice(result.message || "Action saved.");
    } catch (e) {
      setNotice(String(e));
    }
  }
  const network = d.network === "eip155:84532" ? "Base Sepolia" : d.network;
  return (
    <article
      className={`chat-entry role-${m.role} message-${m.type.toLowerCase()}`}
      data-message-type={m.type}
      data-message-id={m.id}
      data-simulation-id={m.simulationId || undefined}
    >
      {!user && (
        <span className="chat-avatar">
          {m.role === "guardian" ? (
            <ShieldCheck size={17} />
          ) : (
            <Sparkles size={16} />
          )}
        </span>
      )}
      <div className="chat-entry-main">
        <div className="chat-message-content">
          {m.type === "APPROVAL_RECEIPT" ? (
            <>
              <h3>Payment request</h3>
              {facts([
                ["Product", d.resource],
                ["Company", d.merchant],
                ["Merchant domain", d.merchantDomain],
                ["Wallet address", d.approvedRecipient],
                ["Cryptocurrency", d.token],
                ["Network", network],
                ["Amount", `${units(d.approvedAmount)} ${d.token}`],
                ["Total payment", `${units(d.approvedAmount)} ${d.token}`],
              ])}
              {s?.stage === "AWAITING_APPROVAL" ? (
                <div className="inline-chat-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => action(s.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => action(s.id, "cancel")}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <span className="chat-stage-label">
                  {d.status === "REJECTED" ? "Rejected" : "Approved"}
                </span>
              )}
            </>
          ) : m.type === "BLOCKED_RECEIPT" ? (
            <>
              <h3>
                <ShieldCheck size={17} /> Payment Blocked
              </h3>
              <p>{m.content}</p>
              {facts([
                ["Reason", d.reason],
                ["Security rule", (d.rules || []).join(", ")],
                ["Authorized amount", `${units(d.approvedAmount)} USDC`],
                ["Attempted amount", `${units(d.requestedAmount)} USDC`],
                ["Intended recipient", d.approvedRecipient],
                [
                  "Attempted recipient",
                  d.requestedRecipient !== d.approvedRecipient
                    ? d.requestedRecipient
                    : null,
                ],
                ["Asset / network", `${d.token} / ${network}`],
                ["Signature status", d.signed ? "Signed" : "Not signed"],
                ["Wallet impact", d.walletImpact],
              ])}
              <button onClick={() => setIncident(true)}>Take Action</button>
            </>
          ) : m.type === "SUCCESS_RECEIPT" ? (
            <>
              <h3>Payment Successful</h3>
              {facts([
                ["Merchant", d.merchant],
                ["Product", d.resource],
                [
                  "Paid amount",
                  `${units(d.paidAmount || d.approvedAmount)} ${d.token}`,
                ],
                ["Network", network],
                ["Recipient", d.approvedRecipient],
                ["Payment reference", d.paymentReference],
                ["Time", date(d.paidAt)],
                ["Settlement status", d.settlementStatus],
              ])}
              {d.securityNotes?.map((n: string) => (
                <p key={n}>{n}</p>
              ))}
              <details>
                <summary>Open purchased resource</summary>
                <p>{d.resourceContent}</p>
              </details>
            </>
          ) : (
            <>
              <p>{m.content}</p>
              {m.type === "PRODUCT_RESULTS" && (
                <div className="catalog-products">
                  {d.products.map((p: any) => (
                    <section key={p.id}>
                      <strong>{p.name}</strong>
                      <small>
                        {p.merchant} · {units(p.price)} {p.token}
                      </small>
                      <p>{p.description}</p>
                      <button
                        disabled={busy || Boolean(d.selectedProductId)}
                        onClick={() =>
                          shopping(`products/${p.id}/select`, {
                            discoveryId: m.id,
                            clientKey: crypto.randomUUID(),
                          })
                        }
                      >
                        {d.selectedProductId === p.id ? "Selected" : "Select"}
                      </button>
                    </section>
                  ))}
                </div>
              )}
              {m.type === "PAYMENT_METHODS" &&
                d.methods.map((v: any) => (
                  <section className="payment-option" key={v.id}>
                    <strong>
                      {v.token} — {v.networkName}
                    </strong>
                    <small>
                      {v.available
                        ? `Available Balance: ${units(v.balance)} ${v.token}`
                        : v.reason}
                    </small>
                    <button
                      disabled={
                        busy || !v.available || Boolean(d.selectedMethod)
                      }
                      onClick={() =>
                        shopping(`selections/${d.selectionId}/method`, {
                          methodId: v.id,
                        })
                      }
                    >
                      {d.selectedMethod === v.id
                        ? "Selected"
                        : v.available
                          ? "Select"
                          : "Unavailable"}
                    </button>
                  </section>
                ))}
            </>
          )}
          {m.simulationId && (
            <JsonPanel
              label="View technical details"
              value={{ ...d, currentState: s?.stage, decisions: s?.decisions }}
            />
          )}
        </div>
      </div>
      {incident && (
        <Dialog title="Incident response" onClose={() => setIncident(false)}>
          <p>{d.walletImpact}</p>
          <JsonPanel
            label="View complete security evidence"
            value={{ ...d, decisions: s?.decisions }}
          />
          <div className="incident-actions">
            {[
              ["REPORT", "Report suspicious merchant or wallet"],
              ["SAVE", "Save to investigation center"],
              ["RESTRICT", "Restrict payment permissions"],
              ["MONITOR", "Monitor address"],
            ].map(([kind, label]) => (
              <button key={kind} onClick={() => respond(kind)}>
                {label}
              </button>
            ))}
          </div>
          <p>{notice}</p>
        </Dialog>
      )}
    </article>
  );
}
