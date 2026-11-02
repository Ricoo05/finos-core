import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  Globe2,
  Lock,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

const tabs = [
  ["settle", "Settlement", ArrowRightLeft, "Settlement Workbench & Ledger"],
  ["market", "Market & scenarios", Globe2, "Reference FX Desk & Analysis"],
  ["pipeline", "Event pipeline", GitBranch, "Outbox, Kafka & Risk Pipeline"],
  ["overview", "Overview", Activity, "Positions & Reconciliation"],
  ["journal", "Journal", FileText, "Immutable Journal"],
  ["evidence", "Engineering", ShieldCheck, "Engineering & Test Evidence"],
];
export function parseMinor(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const [whole, frac = ""] = value.split(".");
  const n = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  if (n <= 0n || n > 999999999999999n)
    throw new Error("Amount is outside the supported range.");
  return n.toString();
}
const money = (v = "0", ccy = "INR") => {
  const n = BigInt(String(v));
  const a = n < 0n ? -n : n;
  return `${n < 0n ? "−" : ""}${ccy === "INR" ? "₹" : ccy + " "}${(a / 100n).toLocaleString("en-IN")}.${(a % 100n).toString().padStart(2, "0")}`;
};
const stamp = (v) =>
  v ? new Date(v).toLocaleTimeString("en-IN", { hour12: false }) : "—";
const fresh = () => crypto.randomUUID();
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response
    .json()
    .catch(() => ({ detail: "The server could not complete this request." }));
  if (!response.ok)
    throw new Error(
      `${response.status} · ${body.detail || body.error || "Request failed"}`,
    );
  return body;
}
function Badge({ children, good = false, warn = false }) {
  return (
    <span className={`badge ${good ? "good" : warn ? "warn" : ""}`}>
      {children}
    </span>
  );
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Metric({ label, value, note, accent }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={accent ? "mint" : ""}>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
function DataTable({ columns, rows, render, empty = "No records yet." }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(render)}</tbody>
      </table>
    </div>
  ) : (
    <Empty>{empty}</Empty>
  );
}

function AccountGrid({ accounts, busy, online, onFreeze, heading = true }) {
  return (
    <section className="accounts-section" aria-label="Account positions">
      {heading && (
        <div className="section-heading">
          <div>
            <Database size={16} />
            <h2>Account positions</h2>
            <span>
              POSTGRESQL ACCOUNTS · MATERIALIZED BALANCES & ACCOUNT STATUS
            </span>
          </div>
          <Badge>{accounts.length} INR ACCOUNTS</Badge>
        </div>
      )}
      <div className="account-grid account-controls">
        {accounts.map((a) => (
          <div
            className={`account-card ${a.status === "FROZEN" ? "is-frozen" : ""}`}
            key={a.id}
          >
            <div className="account-card-top">
              <code title={a.id}>ACC-{a.id.slice(-4)}</code>
              <Badge good={a.status === "ACTIVE"} warn={a.status === "FROZEN"}>
                {a.status}
              </Badge>
              <button
                disabled={busy || !online}
                className="secondary small"
                onClick={() => onFreeze(a)}
              >
                {a.status === "ACTIVE" ? "Freeze" : "Unfreeze"}
              </button>
            </div>
            <h3>{a.name}</h3>
            <div className="balance-label">
              <span>MATERIALIZED BALANCE (V{a.version})</span>
              <span>BIGINT PAISE</span>
            </div>
            <div className="card-balance">
              <strong>{money(a.balance)}</strong>
              <span>{BigInt(a.balance).toLocaleString("en-IN")} paise</span>
            </div>
            <dl className="account-flow">
              <div>
                <dt>PROCESSED INFLOW</dt>
                <dd>{money(a.inflow)}</dd>
              </div>
              <div>
                <dt>PROCESSED OUTFLOW</dt>
                <dd>{money(a.outflow)}</dd>
              </div>
              <div>
                <dt>FLOW EVENTS</dt>
                <dd>{a.events}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
function Journal({ entries }) {
  return (
    <Panel
      title="Double-entry journal"
      subtitle="Negative = funds out; positive = funds in. Opening equity is included in the global invariant."
    >
      <DataTable
        columns={["ENTRY", "TRANSACTION", "ACCOUNT", "SIGNED AMOUNT", "TIME"]}
        rows={entries}
        render={(e) => (
          <tr key={e.id}>
            <td className="mono">#{e.id}</td>
            <td className="mono">{e.transfer_id}</td>
            <td>{e.account}</td>
            <td
              className={`mono ${BigInt(e.signed_amount) > 0n ? "mint" : ""}`}
            >
              {money(e.signed_amount)}
            </td>
            <td className="mono muted">{stamp(e.created_at)}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

export default function App() {
  const [tab, setTab] = useState("settle"),
    [data, setData] = useState(null),
    [online, setOnline] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [source, setSource] = useState("00000000-0000-0000-0000-000000000101"),
    [dest, setDest] = useState("00000000-0000-0000-0000-000000000102");
  const [amount, setAmount] = useState("25000.00"),
    [currency, setCurrency] = useState("INR"),
    [reference, setReference] = useState(() => `TX-${fresh().slice(0, 12)}`),
    [key, setKey] = useState(fresh);
  const [quote, setQuote] = useState(null),
    [receipt, setReceipt] = useState(null),
    [last, setLast] = useState(() => {
      try {
        return JSON.parse(sessionStorage.getItem("finos-last-request"));
      } catch {
        return null;
      }
    });
  const [shock, setShock] = useState(1),
    [filter, setFilter] = useState(""),
    [evidence, setEvidence] = useState(null),
    [connectionError, setConnectionError] = useState("");
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await api("/state");
      setData(next);
      setOnline(true);
      setConnectionError("");
    } catch (e) {
      setOnline(false);
      setConnectionError(e.message);
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.addEventListener("refresh", refresh);
    es.onerror = () => setOnline(false);
    const fallback = setInterval(refresh, 10000);
    return () => {
      es.close();
      clearInterval(fallback);
    };
  }, [refresh]);
  useEffect(() => {
    fetch("/verification.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEvidence)
      .catch(() => {});
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (setter, value) => {
    setter(value);
    setQuote(null);
    setKey(fresh());
  };
  const submit = () =>
    run(async () => {
      const request = {
        sourceId: source,
        destinationId: dest,
        amountMinor: parseMinor(amount),
        currency,
        reference,
        quoteId: currency === "INR" ? null : quote?.quoteId,
      };
      if (currency !== "INR" && !request.quoteId)
        throw new Error("Get an FX quote before submitting.");
      const attempt = { key, request };
      setLast(attempt);
      sessionStorage.setItem("finos-last-request", JSON.stringify(attempt));
      setReceipt(
        await api("/transfers", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(request),
        }),
      );
    });
  const replay = (tamper = false) =>
    run(async () => {
      if (!last) throw new Error("Submit a transfer first.");
      const request = tamper
        ? {
            ...last.request,
            amountMinor: (BigInt(last.request.amountMinor) + 1n).toString(),
          }
        : last.request;
      setReceipt(
        await api("/transfers", {
          method: "POST",
          headers: { "Idempotency-Key": last.key },
          body: JSON.stringify(request),
        }),
      );
    });
  const newTransfer = () => {
    setKey(fresh());
    setReference(`TX-${fresh().slice(0, 12)}`);
    setQuote(null);
    setReceipt(null);
    setError("");
  };
  const accounts = data?.accounts || [],
    counts = data?.counts || {},
    system = data?.system || {},
    audit = data?.reconciliation,
    market = data?.market;
  const total = accounts.reduce((s, a) => s + BigInt(a.balance), 0n);
  const transactions = (data?.transfers || []).filter((t) =>
    [t.reference, t.source, t.destination, t.id]
      .join(" ")
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const sumInflows = accounts.reduce((s, a) => s + BigInt(a.inflow), 0n);
  const navTitle = tabs.find((t) => t[0] === tab)[1];
  const freezeAccount = (a) =>
    run(async () => {
      await api(`/accounts/${a.id}/status`, {
        method: "POST",
        body: JSON.stringify({ frozen: a.status === "ACTIVE" }),
      });
    });
  return (
    <div className="desk">
      <header className="console-header">
        <div className="console-identity">
          <span className="console-mark">
            <ShieldCheck size={23} />
          </span>
          <div className="console-title">
            <div>
              <h1>FINOS-CORE: DOUBLE-ENTRY SETTLEMENT & RISK ENGINE</h1>
              {evidence && (
                <Badge good={evidence.passed} warn={!evidence.passed}>
                  {evidence.passed
                    ? "RECORDED TESTS PASSED"
                    : "CHECK TEST RESULTS"}
                </Badge>
              )}
            </div>
            <p>
              Java 21 · PostgreSQL ACID ·{" "}
              {system.eventMode === "kafka"
                ? "Kafka event transport"
                : "Durable event transport"}{" "}
              · Idempotent settlement · Reference FX
            </p>
          </div>
        </div>
        <div className="console-toolbar">
          <div
            className={`telemetry-chip ${audit?.healthy ? "healthy" : "caution"}`}
          >
            <span className={`status-dot ${audit?.healthy ? "live" : ""}`} />
            <span>
              Σ(LEDGER): {audit?.globalSumMinor ?? "—"} paise | DRIFT:{" "}
              {audit ? `${audit.accountDrift.length} breaks` : "—"}
            </span>
          </div>
          <span className="telemetry-chip">CACHE: {system.cache || "—"}</span>
          <button
            className={`telemetry-chip fx-chip ${market?.stale ? "caution" : ""}`}
            onClick={() => {
              setTab("market");
              setError("");
            }}
            title={
              market?.asOf
                ? `Daily reference data as of ${market.asOf}`
                : "FX provider status"
            }
          >
            <Globe2 size={13} />
            {market?.available
              ? `USD/INR: ₹${Number(market.ratesToInr.USD).toFixed(4)}${market.stale ? " · STALE" : " · REFERENCE"}`
              : "FX: UNAVAILABLE"}
          </button>
          <button
            className="primary compact"
            onClick={() => setTab(tab === "settle" ? "journal" : "settle")}
          >
            <ArrowRightLeft size={13} />
            {tab === "settle" ? "View journal" : "Open settlement"}
          </button>
          <div className="connection-line">
            <span className={`status-dot ${online ? "live" : ""}`} />
            <span>
              {online ? "Server updates every 2s" : "Data may be stale"}
            </span>
            <button
              aria-label="Refresh data"
              className="icon-button"
              onClick={refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>
      <nav className="console-tabs" aria-label="Workspace">
        {tabs.map(([id, label, Icon, title], i) => (
          <button
            key={id}
            aria-label={label}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "selected" : ""}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            <Icon size={16} />
            <span>
              {i + 1}. {title}
            </span>
            {id === "market" && <span className="tab-tag">FX</span>}
          </button>
        ))}
      </nav>
      <div className="workspace">
        <main className="content" data-view={tab}>
          {tab !== "settle" && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  FINOS-CORE / {navTitle.toUpperCase()}
                </div>
                <h2>{navTitle}</h2>
                <p>
                  {tab === "overview"
                    ? "Materialized positions, reconciliation and recent settlements."
                    : tab === "journal"
                      ? "An append-only history backed by PostgreSQL constraints."
                      : tab === "pipeline"
                        ? "Committed transfers, durable delivery and idempotent risk projection."
                        : tab === "market"
                          ? "Provider timestamps, reference FX and transparent scenario assumptions."
                          : "Running architecture, recorded tests and system boundaries."}
                </p>
              </div>
              <Badge good={audit?.healthy} warn={!audit?.healthy}>
                {audit?.healthy ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <ShieldCheck size={12} />
                )}{" "}
                {audit?.healthy
                  ? "LEDGER RECONCILED"
                  : "AWAITING RECONCILIATION"}
              </Badge>
            </div>
          )}
          {connectionError && (
            <div className="alert error" role="alert">
              <XCircle size={17} />
              <span>{connectionError}</span>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              <XCircle size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {!data ? (
            <Panel title="Connecting to the ledger">
              <Empty>
                Waiting for the Java API on port 8080. Start the project with
                Start-FINOS.ps1.
              </Empty>
            </Panel>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <div className="metrics-grid">
                    <Metric
                      label="OPERATIONAL CASH"
                      value={money(total)}
                      note="Four INR accounts · excludes opening equity"
                      accent
                    />
                    <Metric
                      label="SETTLED TRANSFERS"
                      value={counts.transfers}
                      note={`${money(counts.volume)} cumulative volume`}
                    />
                    <Metric
                      label="PENDING EVENTS"
                      value={counts.pending}
                      note={`${Number(counts.oldest_pending_seconds).toFixed(1)}s oldest pending age`}
                    />
                    <Metric
                      label="LEDGER IMBALANCE"
                      value={money(audit.globalSumMinor)}
                      note={`${audit.unbalancedTransfers} unbalanced transfers`}
                      accent
                    />
                  </div>
                  <div className="two-column">
                    <Panel
                      title="Account positions"
                      subtitle="Materialized balances, reconciled against the journal"
                      action={
                        <button
                          className="text-button"
                          onClick={() => setTab("settle")}
                        >
                          Make a transfer <ArrowUpRight size={14} />
                        </button>
                      }
                    >
                      <AccountGrid
                        accounts={accounts}
                        busy={busy}
                        online={online}
                        onFreeze={freezeAccount}
                        heading={false}
                      />
                    </Panel>
                    <Panel
                      title="Integrity monitor"
                      subtitle="Checks run against actual database state"
                    >
                      <div className="integrity-hero">
                        <ShieldCheck size={38} />
                        <strong>
                          {audit.healthy
                            ? "All balances reconcile"
                            : "Investigation required"}
                        </strong>
                        <p>
                          Journal sum, per-transfer balance, and account
                          reconstruction.
                        </p>
                      </div>
                      <div className="check-row">
                        <span>Double-entry journal</span>
                        <Badge good={audit.unbalancedTransfers === 0}>
                          {audit.unbalancedTransfers === 0
                            ? "BALANCED"
                            : "FAILED"}
                        </Badge>
                      </div>
                      <div className="check-row">
                        <span>Account drift</span>
                        <strong>{audit.accountDrift.length} breaks</strong>
                      </div>
                      <div className="check-row">
                        <span>Last database check</span>
                        <span className="mono">{stamp(audit.checkedAt)}</span>
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    title="Recent settlements"
                    subtitle="Latest 8 transfers · includes documented opening entries"
                    action={
                      <button
                        className="text-button"
                        onClick={() => setTab("journal")}
                      >
                        View journal <ArrowUpRight size={14} />
                      </button>
                    }
                  >
                    <DataTable
                      columns={[
                        "REFERENCE",
                        "ROUTE",
                        "AMOUNT",
                        "POSTED",
                        "STATE",
                      ]}
                      rows={data.transfers.slice(0, 8)}
                      render={(t) => (
                        <tr key={t.id}>
                          <td className="mono">{t.reference}</td>
                          <td>
                            {t.source}
                            <span className="route-arrow">→</span>
                            {t.destination}
                          </td>
                          <td className="mono">{money(t.amount)}</td>
                          <td className="muted mono">{stamp(t.created_at)}</td>
                          <td>
                            <Badge good>POSTED</Badge>
                          </td>
                        </tr>
                      )}
                    />
                  </Panel>
                </>
              )}
              {tab === "settle" && (
                <>
                  <AccountGrid
                    accounts={accounts}
                    busy={busy}
                    online={online}
                    onFreeze={freezeAccount}
                  />
                  <div
                    className={`reconciliation-strip ${audit.healthy ? "healthy" : "caution"}`}
                  >
                    <ShieldCheck size={17} />
                    <strong>
                      {audit.healthy
                        ? "All balances reconcile"
                        : "Investigation required"}
                    </strong>
                    <span>Σ journal: {audit.globalSumMinor} paise</span>
                    <span>{audit.accountDrift.length} account breaks</span>
                    <span>{data.counts.journal_entries} journal legs</span>
                    <span className="reconciliation-time">
                      Checked {stamp(audit.checkedAt)}
                    </span>
                  </div>
                  <div className="two-column settle-grid">
                    <Panel
                      title="New transfer"
                      subtitle="Settlement currency: INR · amounts stored as BIGINT paise"
                    >
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submit();
                        }}
                        className="transfer-form"
                      >
                        <div className="form-row">
                          <label>
                            From account
                            <select
                              aria-label="From account"
                              value={source}
                              onChange={(e) => edit(setSource, e.target.value)}
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} · {money(a.balance)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            To account
                            <select
                              aria-label="To account"
                              value={dest}
                              onChange={(e) => edit(setDest, e.target.value)}
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="amount-row">
                          <label>
                            Amount
                            <input
                              aria-label="Amount"
                              inputMode="decimal"
                              value={amount}
                              onChange={(e) => edit(setAmount, e.target.value)}
                              required
                            />
                          </label>
                          <label>
                            Input currency
                            <select
                              aria-label="Input currency"
                              value={currency}
                              onChange={(e) =>
                                edit(setCurrency, e.target.value)
                              }
                            >
                              {["INR", "USD", "EUR", "GBP"].map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          Reference
                          <input
                            aria-label="Reference"
                            value={reference}
                            maxLength={100}
                            onChange={(e) => edit(setReference, e.target.value)}
                            required
                          />
                        </label>
                        <label>
                          Idempotency key
                          <div className="key-field mono">
                            {key}
                            <Lock size={14} />
                          </div>
                          <small>
                            Unchanged on retry. Editing the request generates a
                            fresh key.
                          </small>
                        </label>
                        {currency !== "INR" && (
                          <div className="quote-box">
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy || !online}
                              onClick={() =>
                                run(async () =>
                                  setQuote(
                                    await api("/quotes", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        currency,
                                        amountMinor: parseMinor(amount),
                                      }),
                                    }),
                                  ),
                                )
                              }
                            >
                              Get reference FX quote
                            </button>
                            {quote ? (
                              <p>
                                {money(quote.settlementAmountMinor)} at{" "}
                                {Number(quote.rate).toFixed(4)} INR/{currency}
                                <br />
                                <small>
                                  Quote expires {stamp(quote.expiresAt)} ·
                                  provider as of{" "}
                                  {new Date(quote.asOf).toLocaleString()}
                                </small>
                              </p>
                            ) : (
                              <small>
                                Locks the conversion for 120 seconds. Uses daily
                                reference rates with HALF_EVEN rounding; no
                                spread.
                              </small>
                            )}
                          </div>
                        )}
                        <button
                          className="primary full"
                          disabled={
                            busy ||
                            !online ||
                            source === dest ||
                            (currency !== "INR" && !quote)
                          }
                        >
                          <ArrowRightLeft size={17} />
                          {busy ? "Processing…" : "Post transfer"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={newTransfer}
                        >
                          Start a new transfer / new key
                        </button>
                      </form>
                    </Panel>
                    <div className="stack">
                      <Panel
                        title="Settlement receipt"
                        subtitle="Returned by the backend after database commit"
                      >
                        {receipt ? (
                          <div className="receipt">
                            <Badge good>
                              {receipt.replayed
                                ? "IDEMPOTENT REPLAY"
                                : "COMMITTED"}
                            </Badge>
                            <h3>{money(receipt.receipt.amountMinor)}</h3>
                            <p>Served by {receipt.servedBy}</p>
                            <dl>
                              {[
                                ["Transaction", receipt.receipt.transactionId],
                                ["Reference", receipt.receipt.reference],
                                ["Trace ID", receipt.receipt.traceId],
                                [
                                  "Committed",
                                  new Date(
                                    receipt.receipt.settledAt,
                                  ).toLocaleString(),
                                ],
                              ].map(([k, v]) => (
                                <React.Fragment key={k}>
                                  <dt>{k}</dt>
                                  <dd>{v}</dd>
                                </React.Fragment>
                              ))}
                            </dl>
                          </div>
                        ) : (
                          <Empty>
                            Submit a transfer to inspect its receipt.
                            <br />A network failure can be retried with the same
                            key.
                          </Empty>
                        )}
                        {last && (
                          <div className="receipt-actions">
                            <button
                              disabled={busy || !online}
                              className="secondary"
                              onClick={() => replay()}
                            >
                              Replay last request
                            </button>
                            <button
                              disabled={busy || !online}
                              className="secondary"
                              onClick={() => replay(true)}
                            >
                              Test payload mismatch
                            </button>
                          </div>
                        )}
                      </Panel>
                    </div>
                  </div>
                  <Journal entries={data.journal} />
                </>
              )}
              {tab === "journal" && (
                <>
                  <div className="journal-toolbar">
                    <label className="search-label">
                      Find a transfer
                      <input
                        aria-label="Find a transfer"
                        placeholder="Reference, account or transaction ID"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                    </label>
                    <Badge>
                      {data.journal.length} most recent journal legs shown
                    </Badge>
                  </div>
                  <Panel
                    title="Transfers"
                    subtitle="Immutable records · newest first"
                  >
                    <DataTable
                      columns={[
                        "REFERENCE / ID",
                        "SOURCE → DESTINATION",
                        "SETTLED INR",
                        "ORIGINAL",
                        "TIME",
                      ]}
                      rows={transactions}
                      render={(t) => (
                        <tr key={t.id}>
                          <td>
                            <strong className="mono">{t.reference}</strong>
                            <small className="cell-sub mono">{t.id}</small>
                          </td>
                          <td>
                            {t.source}
                            <span className="route-arrow">→</span>
                            {t.destination}
                          </td>
                          <td className="mono">{money(t.amount)}</td>
                          <td className="mono">
                            {money(t.original_amount, t.original_currency)}
                          </td>
                          <td className="mono muted">{stamp(t.created_at)}</td>
                        </tr>
                      )}
                    />
                  </Panel>
                  <Journal entries={data.journal} />
                </>
              )}
              {tab === "pipeline" && (
                <>
                  <div className="pipeline-path">
                    {[
                      "HTTP request",
                      "PostgreSQL commit",
                      "Transactional outbox",
                      system.eventMode === "kafka"
                        ? "Apache Kafka"
                        : "PostgreSQL relay",
                      "Durable inbox + risk",
                    ].map((s, i) => (
                      <React.Fragment key={s}>
                        {i > 0 && <span>→</span>}
                        <div>
                          <span className="step-number">0{i + 1}</span>
                          {s}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="metrics-grid">
                    <Metric
                      label="RELAY MODE"
                      value={
                        system.eventMode === "kafka" ? "Kafka" : "PostgreSQL"
                      }
                      note="Actual configured transport"
                    />
                    <Metric
                      label="COMMITTED EVENTS"
                      value={counts.committed_events}
                      note="Durably recorded in PostgreSQL"
                    />
                    <Metric
                      label="CONSUMED EVENTS"
                      value={counts.consumed}
                      note="Durable event-ID deduplication"
                      accent
                    />
                    <Metric
                      label="RELAY STATE"
                      value={
                        system.relayPaused
                          ? "Paused"
                          : system.relayError
                            ? "Retrying"
                            : "Running"
                      }
                      note={
                        system.relayError ||
                        "Background worker · 1 second interval"
                      }
                    />
                  </div>
                  <Panel
                    title="Outbox delivery"
                    subtitle="Pause the relay, post transfers, then resume to demonstrate backlog recovery."
                    action={
                      <button
                        disabled={busy || !online}
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            await api("/pipeline/pause", {
                              method: "POST",
                              body: JSON.stringify({
                                paused: !system.relayPaused,
                              }),
                            });
                          })
                        }
                      >
                        {system.relayPaused ? (
                          <Play size={14} />
                        ) : (
                          <Pause size={14} />
                        )}{" "}
                        {system.relayPaused ? "Resume relay" : "Pause relay"}
                      </button>
                    }
                  >
                    <DataTable
                      columns={[
                        "EVENT ID",
                        "STATE",
                        "CREATED",
                        "PROCESSED",
                        "VERIFY",
                      ]}
                      rows={data.outbox}
                      empty="Post a transfer to create a real outbox event."
                      render={(e) => (
                        <tr key={e.id}>
                          <td className="mono">{e.id}</td>
                          <td>
                            <Badge
                              good={e.status === "PROCESSED"}
                              warn={e.status !== "PROCESSED"}
                            >
                              {e.status}
                            </Badge>
                          </td>
                          <td className="mono muted">{stamp(e.created_at)}</td>
                          <td className="mono muted">
                            {stamp(e.processed_at)}
                          </td>
                          <td>
                            <button
                              disabled={
                                busy || !online || e.status !== "PROCESSED"
                              }
                              className="text-button"
                              onClick={() =>
                                run(async () => {
                                  const r = await api(
                                    `/pipeline/replay/${e.id}`,
                                    { method: "POST" },
                                  );
                                  setNotice(r.detail);
                                })
                              }
                            >
                              Redeliver
                            </button>
                          </td>
                        </tr>
                      )}
                    />
                  </Panel>
                  <Panel
                    title="Risk flow projection"
                    subtitle="Actual processed transfer flows. Opening balances are excluded; this is not a portfolio VaR model."
                  >
                    <DataTable
                      columns={[
                        "ACCOUNT",
                        "INFLOW",
                        "OUTFLOW",
                        "NET FLOW",
                        "EVENTS",
                      ]}
                      rows={accounts}
                      render={(a) => (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          <td className="mono mint">{money(a.inflow)}</td>
                          <td className="mono">{money(a.outflow)}</td>
                          <td className="mono">
                            {money(BigInt(a.inflow) - BigInt(a.outflow))}
                          </td>
                          <td>{a.events}</td>
                        </tr>
                      )}
                    />
                  </Panel>
                </>
              )}
              {tab === "market" && (
                <>
                  <div className="market-intro">
                    <Globe2 size={22} />
                    <div>
                      <strong>Reference FX, with provenance</strong>
                      <p>
                        Daily provider data powers immutable conversion quotes.
                        Live settlement analytics update from your own ledger.
                      </p>
                    </div>
                    <Badge
                      good={market.available && !market.stale}
                      warn={!market.available || market.stale}
                    >
                      {!market.available
                        ? "UNAVAILABLE"
                        : market.stale
                          ? "STALE"
                          : "REFERENCE DATA AVAILABLE"}
                    </Badge>
                  </div>
                  {market.available ? (
                    <>
                      <div className="fx-grid">
                        {Object.entries(market.ratesToInr).map(
                          ([ccy, rate]) => (
                            <div className="fx-card" key={ccy}>
                              <span>{ccy} / INR</span>
                              <strong>₹{Number(rate).toFixed(4)}</strong>
                              <small>
                                Daily reference · no generated price movements
                              </small>
                            </div>
                          ),
                        )}
                      </div>
                      <div className="source-line">
                        <a
                          href="https://www.exchangerate-api.com"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Rates By Exchange Rate API ↗
                        </a>
                        <span>
                          Provider timestamp:{" "}
                          {new Date(market.asOf).toLocaleString()} · age{" "}
                          {(market.ageSeconds / 3600).toFixed(1)}h
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="alert error">
                      {market.lastError} No fallback prices are invented.
                    </div>
                  )}
                  <div className="two-column">
                    <Panel
                      title="USD translation sensitivity"
                      subtitle="Hypothetical change in USD value of INR cash; not a loss forecast or VaR"
                    >
                      <div className="scenario">
                        <label htmlFor="shock">
                          USD/INR scenario{" "}
                          <strong>
                            {shock > 0 ? "+" : ""}
                            {shock}%
                          </strong>
                        </label>
                        <input
                          id="shock"
                          type="range"
                          min="-10"
                          max="10"
                          step="0.25"
                          value={shock}
                          onChange={(e) => setShock(Number(e.target.value))}
                        />
                        <div className="scenario-ends">
                          <span>INR strengthens</span>
                          <span>INR weakens</span>
                        </div>
                        {market.available ? (
                          <>
                            <div className="scenario-value">
                              $
                              {(
                                Number(total) /
                                100 /
                                Number(market.ratesToInr.USD) /
                                (1 + shock / 100)
                              ).toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                              })}
                            </div>
                            <p>
                              Baseline $
                              {(
                                Number(total) /
                                100 /
                                Number(market.ratesToInr.USD)
                              ).toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              · fixed INR cash {money(total)}. Applies the
                              selected percentage to the reference USD/INR rate.
                            </p>
                          </>
                        ) : (
                          <Empty>
                            A reference quote is required for this scenario.
                          </Empty>
                        )}
                      </div>
                    </Panel>
                    <Panel
                      title="Settlement analysis"
                      subtitle="Computed from durable transfers and the event projection"
                    >
                      <div className="check-row">
                        <span>Settled volume</span>
                        <strong className="mono">{money(counts.volume)}</strong>
                      </div>
                      <div className="check-row">
                        <span>Projected inflows</span>
                        <strong className="mono">{money(sumInflows)}</strong>
                      </div>
                      <div className="check-row">
                        <span>Not yet projected</span>
                        <strong className="mono">
                          {money(BigInt(counts.volume) - sumInflows)}
                        </strong>
                      </div>
                      <div className="check-row">
                        <span>Projection lag</span>
                        <strong>{counts.unprojected_events} events</strong>
                      </div>
                      <div
                        className="activity-bars"
                        aria-label="Transfer counts by active minute"
                      >
                        {data.activity.length ? (
                          data.activity.map((a, i) => (
                            <div
                              key={i}
                              title={`${stamp(a.minute)}: ${a.count} transfers`}
                              style={{
                                height: `${Math.max(8, Math.min(100, (Number(a.count) / Math.max(...data.activity.map((x) => Number(x.count)))) * 100))}%`,
                              }}
                            />
                          ))
                        ) : (
                          <p>
                            No operational transfers in the last 30 minutes.
                          </p>
                        )}
                      </div>
                      <p className="panel-note">
                        Transfer counts per active minute, last 30 minutes.
                        Refreshes from the server.
                      </p>
                    </Panel>
                  </div>
                </>
              )}
              {tab === "evidence" && (
                <>
                  <div className="two-column">
                    <Panel
                      title="Running architecture"
                      subtitle="A deliberately bounded, testable system"
                    >
                      <ul className="engineering-list">
                        <li>
                          <CheckCircle2 />
                          Java {system.runtime} HTTP API with virtual threads
                          and a 32-request database bulkhead.
                        </li>
                        <li>
                          <CheckCircle2 />
                          PostgreSQL durable ledger with paired entries,
                          immutable history, ordered account locks, and deferred
                          integrity checks.
                        </li>
                        <li>
                          <CheckCircle2 />
                          SHA-256 request identity; receipts cached only after
                          commit. Current cache: {system.cache}.
                        </li>
                        <li>
                          <CheckCircle2 />
                          {system.eventMode === "kafka"
                            ? "Kafka transport with at-least-once delivery."
                            : "PostgreSQL event relay. Kafka transport is available through EVENT_MODE=kafka."}{" "}
                          Inbox deduplication and risk updates share a
                          transaction.
                        </li>
                        <li>
                          <CheckCircle2 />
                          Exact integer minor units and server-issued FX quotes;
                          explicit rounding and provider timestamps.
                        </li>
                      </ul>
                    </Panel>
                    <Panel
                      title="Verification evidence"
                      subtitle="Measured checks, not prefilled success badges"
                    >
                      {evidence ? (
                        <>
                          <Badge good={evidence.passed} warn={!evidence.passed}>
                            {evidence.passed
                              ? "TEST RUN PASSED"
                              : "CHECK RESULTS"}
                          </Badge>
                          <p className="evidence-time">
                            Recorded{" "}
                            {new Date(evidence.recordedAt).toLocaleString()}
                          </p>
                          <ul className="evidence-list">
                            {evidence.checks.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                          <p className="panel-note">{evidence.scope}</p>
                        </>
                      ) : (
                        <Empty>
                          Verification report has not been generated yet. No
                          benchmark claims are shown.
                        </Empty>
                      )}
                    </Panel>
                  </div>
                  <Panel
                    title="Guarantees and boundaries"
                    subtitle="The parts an engineering interview should examine"
                  >
                    <div className="boundary-grid">
                      <div>
                        <h3>Durability & retries</h3>
                        <p>
                          Idempotency records and receipts live in the same
                          transaction as the money movement. A retry after
                          commit returns the original receipt. Validation
                          failures roll back the key claim.
                        </p>
                      </div>
                      <div>
                        <h3>Delivery semantics</h3>
                        <p>
                          The Kafka path may redeliver after a crash. The risk
                          consumer stores its event ID and projection atomically
                          in PostgreSQL. No claim of global exactly-once
                          delivery.
                        </p>
                      </div>
                      <div>
                        <h3>Deployment boundary</h3>
                        <p>
                          Local, single-primary portfolio system with demo
                          funds. Multi-region failover, authentication, disaster
                          recovery, and regulatory controls are outside this
                          implementation.
                        </p>
                      </div>
                      <div>
                        <h3>Performance & sharding</h3>
                        <p>
                          Account writes use ordered row locks. Hot accounts
                          serialize. No unmeasured TPS claims or simulated
                          sharding speedups are presented as results.
                        </p>
                      </div>
                    </div>
                    <div className="evidence-links">
                      <a href="/actuator/prometheus" target="_blank">
                        Inspect Prometheus metrics ↗
                      </a>
                      <a href="/?mode=simulator" target="_blank">
                        Original educational simulator ↗
                      </a>
                    </div>
                  </Panel>
                </>
              )}
            </>
          )}
          <footer className="footer">
            <span>
              FINOS-CORE / LOCAL DEVELOPMENT · Independent project · No FINOS or
              bank affiliation
            </span>
            <span>
              Demo funds ·{" "}
              {system.eventMode === "kafka"
                ? "Kafka event transport"
                : "PostgreSQL event transport"}{" "}
              ·{" "}
              {online
                ? `Updated ${stamp(system.serverTime)}`
                : "Backend disconnected"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
