import React, { useEffect, useState } from "react";
import { workspaceSession } from "../workspace-api";
async function request(path: string, body?: any) {
  const r = await fetch("/api/live" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
const amount = (v: string) => {
  const n = BigInt(v);
  return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0")}`;
};
export function TestnetWorkspace({ path }: { path: string }) {
  const red = path.startsWith("/red-team"),
    [status, setStatus] = useState<any>(),
    [balance, setBalance] = useState<any>(),
    [intent, setIntent] = useState<any>(),
    [history, setHistory] = useState<any>(),
    [cases, setCases] = useState<any>(),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(),
    [content, setContent] = useState(""),
    [notice, setNotice] = useState("");
  async function refresh() {
    await workspaceSession(red ? "red" : "blue");
    setStatus(await request("/status"));
    setHistory(await request("/history"));
    if (path.includes("platform")) setCases(await request("/cases"));
    try {
      setBalance(await request("/balance"));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    const reload = () => void refresh().catch((e) => setError(String(e)));
    window.addEventListener("testnet-refresh", reload);
    let events: EventSource;
    void refresh()
      .then(() => {
        events = new EventSource(
          "/api/live/events?after=" +
            (sessionStorage.getItem("live-cursor") || "0"),
        );
        events.onmessage = (e) => {
          sessionStorage.setItem("live-cursor", e.lastEventId);
          setNotice(JSON.parse(e.data).type);
          void request("/history").then(setHistory);
        };
      })
      .catch((e) => setError(String(e)));
    return () => {
      events?.close();
      window.removeEventListener("testnet-refresh", reload);
    };
  }, [path]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const chat = path === "/blue-team" || path.endsWith("ai-agent");
  return (
    <div className="testnet-workspace">
      <p className="subtle-label">
        Base Sepolia Testnet · Test tokens have no monetary value
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && <small role="status">{notice}</small>}
      {chat && (
        <section className="surface">
          <h2>CrypBridge</h2>
          <p>I can buy the AI Security Research Report for 1 USDC.</p>
          <p>
            {balance
              ? `Wallet: ${amount(balance.usdcAtomic)} USDC · ${balance.ethWei} wei ETH`
              : "Buyer wallet balance unavailable"}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setIntent(
                  await request("/intents", {
                    clientKey: crypto.randomUUID(),
                    message,
                  }),
                );
                setContent("");
              });
            }}
          >
            <input
              aria-label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Buy me the AI Security Report for 1 USDC."
            />
            <button
              disabled={
                busy || (!!intent && intent.state === "AWAITING_APPROVAL")
              }
            >
              Send
            </button>
          </form>
          {intent && (
            <article className="surface">
              <h3>
                {intent.state === "AWAITING_APPROVAL"
                  ? "Approve payment"
                  : intent.state === "CONFIRMED"
                    ? "Payment confirmed"
                    : intent.state === "BLOCKED"
                      ? "Blocked before signing"
                      : intent.state}
              </h3>
              <p>AI Security Research Report · {amount(intent.amount)} USDC</p>
              <p>Recipient: {intent.payTo}</p>
              <small>x402 V2 · exact · USDC EIP-3009 · Base Sepolia</small>
              {intent.state === "AWAITING_APPROVAL" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setIntent(
                        await request(`/intents/${intent.id}/approve`, {
                          approve: true,
                        }),
                      );
                      await refresh();
                    })
                  }
                >
                  Approve 1 USDC
                </button>
              )}
              {busy && <p role="status">Processing payment…</p>}
              {intent.error && <p>{intent.error}</p>}
              {intent.txHash && (
                <p>
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://sepolia.basescan.org/tx/${intent.txHash}`}
                  >
                    {intent.txHash}
                  </a>
                </p>
              )}
              {["SUBMITTED", "RECONCILING", "CONFIRMING"].includes(
                intent.state,
              ) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setIntent(await request(`/intents/${intent.id}`)),
                    )
                  }
                >
                  Check blockchain receipt
                </button>
              )}
              {intent.state === "CONFIRMED" && (
                <button
                  onClick={() =>
                    void run(async () => {
                      const r = await fetch(
                        `/api/live/intents/${intent.id}/resource`,
                      );
                      if (!r.ok) throw new Error("Resource unavailable");
                      setContent(await r.text());
                    })
                  }
                >
                  Read purchased report
                </button>
              )}
            </article>
          )}
          {content && <pre style={{ whiteSpace: "pre-wrap" }}>{content}</pre>}
        </section>
      )}
      {red && (
        <section className="surface">
          <h2>Guardian attack testing</h2>
          <p>
            Controlled untrusted inputs use the same deterministic Guardian as
            checkout. Tests do not sign or settle payments.
          </p>
          {[
            "overpayment",
            "wrong-recipient",
            "prompt-injection",
            "duplicate",
            "token-approval",
          ].map((category) => (
            <button
              disabled={busy}
              key={category}
              onClick={() =>
                void run(async () =>
                  setResult(await request("/attacks", { category })),
                )
              }
            >
              {category}
            </button>
          ))}
          {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
        </section>
      )}
      {path.endsWith("security-policies") && (
        <section className="surface">
          <h2>Enforced spending policy</h2>
          <p>
            Maximum 1 USDC per payment, 5 USDC per user over eight hours, and 10
            USDC per buyer over 24 hours. Explicit approval is required for each
            purchase. Only Base Sepolia USDC EIP-3009 signatures are supported.
          </p>
        </section>
      )}
      {!chat && !red && path.startsWith("/blue-team") && (
        <section className="surface">
          <h2>Payment History</h2>
          {history?.intents?.map((p: any) => (
            <article key={p.id}>
              <strong>
                {p.state} · {amount(p.amount)} USDC
              </strong>
              <p>
                {p.buyer} → {p.payTo}
              </p>
              <small>
                {p.createdAt} · Base Sepolia · AI Security Research Report
              </small>
              <p>
                Guardian:{" "}
                {history?.decisions?.find((d: any) => d.intentId === p.id)
                  ?.allowed === true
                  ? "Approved"
                  : history?.decisions
                      ?.find((d: any) => d.intentId === p.id)
                      ?.rules?.join(", ") || "Not evaluated"}
              </p>
              {p.txHash && (
                <p>
                  <a href={`https://sepolia.basescan.org/tx/${p.txHash}`}>
                    {p.txHash}
                  </a>
                </p>
              )}
              {p.error && <p>{p.error}</p>}
            </article>
          ))}
          {!history?.intents?.length && <p>No payments recorded.</p>}
          <h3>Verified USDC transfers</h3>
          {history?.transfers?.map((t: any) => (
            <p key={t.id}>
              {t.status} · {amount(t.amount)} USDC · {t.sender} → {t.recipient}{" "}
              ·{" "}
              <a href={`https://sepolia.basescan.org/tx/${t.txHash}`}>
                {t.txHash}
              </a>
            </p>
          ))}
        </section>
      )}
      {path.startsWith("/platform") && (
        <section className="surface">
          <h2>Scam reports & USDC tracing</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await request("/cases", {
                  txHash: f.get("txHash"),
                  suspect: f.get("suspect"),
                  description: f.get("description"),
                  evidence: f.get("evidence"),
                  network: "eip155:84532",
                });
                await refresh();
              });
            }}
          >
            {[
              ["txHash", "Transaction hash"],
              ["suspect", "Suspected wallet"],
              ["description", "Incident description"],
              ["evidence", "Supporting evidence"],
            ].map(([name, label]) => (
              <p key={name}>
                <input
                  name={name}
                  placeholder={label}
                  aria-label={label}
                  required={name !== "evidence"}
                />
              </p>
            ))}
            <button disabled={busy}>Validate transaction & open case</button>
          </form>
          <p>
            Relationships come from confirmed USDC Transfer logs. They do not
            establish ownership or prove that mixed funds are stolen. Up to
            three hops within indexed history.
          </p>
          {cases && (
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(cases, null, 2)}
            </pre>
          )}
        </section>
      )}
      <details>
        <summary>Connection & monitoring status</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {JSON.stringify(status, null, 2)}
        </pre>
      </details>
    </div>
  );
}
