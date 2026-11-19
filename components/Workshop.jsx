"use client";
import { useEffect, useState, useRef } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  FileText,
  Plus,
  RefreshCw,
  Settings2,
  Users,
  Wallet,
  ClipboardCheck,
  Boxes,
  ReceiptText,
} from "lucide-react";
import { money, niceDate } from "../lib/billing.mjs";
import {
  expenses,
  labels,
  marks,
  monthTitle,
  reportTables,
  sections,
} from "../lib/workshop.mjs";
import { Empty, Field, Modal, Notice } from "./ui.jsx";
import {
  options,
  ProfileForm,
  RecordForm,
  WorkerForm,
} from "./WorkshopForms.jsx";

const views = [
  "Monthly result",
  "Attendance",
  "Payroll",
  "Sales",
  "Expenses",
  "Materials",
  "Rojmel",
  "Reports",
  "Settings",
];

const viewLabels = {
  "Monthly result": "Overview (P&L)",
  Attendance: "Staff Attendance",
  Payroll: "Karigar Payroll",
  Sales: "Party Sales & Challans",
  Expenses: "Expense Register",
  Materials: "Material Purchases",
  Rojmel: "Daily Rojmel",
  Reports: "PDF Reports & Export",
  Settings: "Factory Profile",
};
const categories = {
  Payroll: ["advance", "payout", "night", "bonus", "adjustment"],
  Sales: ["sale"],
  Expenses: ["expense", "settlement"],
  Materials: ["material"],
  Rojmel: ["cashbook"],
};
const reportKey = {
  Payroll: "payroll",
  Sales: "sales",
  Expenses: "expenses",
  Materials: "materials",
  Rojmel: "cashbook",
};
const addLabels = {
  Payroll: "Payroll entry",
  Sales: "Add job sale",
  Expenses: "Add expense",
  Materials: "Add purchase",
  Rojmel: "Add cash entry",
};
const monthEnd = (m) =>
  new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).toISOString().slice(0, 10);
function Stat({ label, amount, icon: Icon }) {
  return (
    <div className="work-stat">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{money(amount)}</strong>
    </div>
  );
}
function Table({ headers, rows, empty = "No entries for this selection." }) {
  return rows.length ? (
    <div className="work-table" tabIndex="0" aria-label={headers.join(", ")}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title={empty} />
  );
}
function ReportPreview({ tables }) {
  return (
    <div className="work-reports">
      {tables.map((t, i) => (
        <section className="work-panel" key={t.key + i}>
          <h3>{t.title}</h3>
          <Table headers={t.headers} rows={t.rows} />
        </section>
      ))}
    </div>
  );
}
function Attendance({ book, today, canWrite, save, busy, open }) {
  const [day, setDay] = useState(
      today.startsWith(book.month) ? today : book.month + "-01",
    ),
    [change, setChange] = useState({});
  const saved = Object.fromEntries(
    book.attendance.filter((a) => a.day === day).map((a) => [a.workerId, a]),
  );
  const list = book.workers.filter((w) => w.active || saved[w.id]);
  const set = (id, patch) =>
    setChange((c) => ({
      ...c,
      [id]: {
        ...saved[id],
        status: saved[id]?.status || "",
        extraHalfDays: saved[id]?.extraHalfDays || 0,
        ...c[id],
        ...patch,
      },
    }));
  function send() {
    const entries = Object.entries(change).map(([workerId, a]) => ({
      workerId,
      status: a.status,
      extraHalfDays: a.extraHalfDays,
      machine: a.machine,
      previous: saved[workerId]
        ? saved[workerId].status +
          "/" +
          saved[workerId].extraHalfDays +
          "/" +
          saved[workerId].machine
        : null,
    }));
    save("attendance", { day, entries }, () => setChange({}));
  }
  return (
    <>
      <section className="work-panel">
        <div className="work-actions">
          <div>
            <h3>Daily attendance</h3>
            <p>P = 1 day · H = ½ · E / Dodh = 1½ · A = 0</p>
          </div>
          <input
            aria-label="Attendance date"
            type="date"
            value={day}
            min={book.month + "-01"}
            max={[monthEnd(book.month), today].sort()[0]}
            onChange={(e) => {
              if (e.target.value) {
                setDay(e.target.value);
                setChange({});
              }
            }}
          />
        </div>
        <Table
          headers={[
            "Karigar",
            "Machine",
            "Attendance mark",
            "Extra machine days",
          ]}
          rows={list.map((w) => {
            const a = change[w.id] || saved[w.id] || {};
            return [
              w.name,
              <input
                aria-label={"Machine for " + w.name}
                disabled={!canWrite || !a.status}
                value={a.machine ?? w.machine}
                maxLength="40"
                onChange={(e) => set(w.id, { machine: e.target.value })}
              />,
              <select
                aria-label={"Attendance for " + w.name}
                disabled={!canWrite}
                value={a.status || ""}
                onChange={(e) =>
                  set(w.id, {
                    status: e.target.value,
                    extraHalfDays: e.target.value ? a.extraHalfDays || 0 : 0,
                  })
                }
              >
                {options(Object.entries(marks), "Unmarked")}
              </select>,
              <input
                aria-label={"Extra days for " + w.name}
                type="number"
                min="0"
                max="3"
                step=".5"
                disabled={!canWrite || !a.status}
                value={(a.extraHalfDays || 0) / 2}
                onChange={(e) =>
                  set(w.id, { extraHalfDays: Number(e.target.value) * 2 })
                }
              />,
            ];
          })}
          empty="Add your first worker to start attendance."
        />
        <p>
          {new Intl.DateTimeFormat("en-IN", {
            weekday: "long",
            timeZone: "UTC",
          }).format(new Date(day + "T00:00:00Z"))}
        </p>
        {canWrite && (
          <div className="work-actions end">
            <button
              className="primary"
              onClick={send}
              disabled={busy || !Object.keys(change).length}
            >
              Save attendance
            </button>
          </div>
        )}
      </section>
      <section className="work-panel">
        <div className="work-actions">
          <h3>Worker directory</h3>
          {canWrite && (
            <button
              className="secondary"
              onClick={() => open({ type: "worker" })}
            >
              <Plus size={15} /> Add worker
            </button>
          )}
        </div>
        <Table
          headers={[
            "Name",
            "Work",
            "Machine",
            "Monthly pay",
            "Daily rate",
            "Status",
            ...(canWrite ? ["Edit"] : []),
          ]}
          rows={book.workers.map((w) => [
            w.name,
            w.job,
            w.machine || "—",
            money(w.rate),
            money(Math.round(w.rate / 30)),
            w.active ? "Active" : "Archived",
            ...(canWrite
              ? [
                  <button
                    className="text-btn"
                    onClick={() => open({ type: "worker", worker: w })}
                  >
                    Edit
                  </button>,
                ]
              : []),
          ])}
        />
      </section>
    </>
  );
}
function Registers({ book, view, open, canWrite }) {
  const [filter, setFilter] = useState(""),
    [category, setCategory] = useState("");
  const supported = categories[view],
    names =
      view === "Expenses"
        ? expenses
        : view === "Materials"
          ? ["Syroski", "Paper Sheet"]
          : view === "Payroll"
            ? supported.map((k) => labels[k])
            : view === "Sales"
              ? book.customers.map((c) => c.name)
              : [];
  const entries = book.records.filter(
    (r) =>
      supported.includes(r.kind) &&
      (!category || [r.party, r.category, labels[r.kind]].includes(category)) &&
      [
        r.party,
        r.memo,
        r.reference,
        r.detail.challan,
        book.workers.find((w) => w.id === r.workerId)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const detailed = {
    ...book,
    records: book.records.filter((r) => entries.some((e) => e.id === r.id)),
  };
  return (
    <>
      {view === "Rojmel" && (
        <ReportPreview tables={reportTables(book, ["cashbook"])} />
      )}
      {view === "Payroll" && (
        <ReportPreview tables={reportTables(book, ["payroll", "advances"])} />
      )}
      <section className="work-panel">
        <div className="work-actions">
          <div>
            <h3>
              {view === "Rojmel"
                ? "Manual cashbook entries"
                : view + " entries"}
            </h3>
          </div>
          {canWrite && (
            <button
              className="primary"
              onClick={() => open({ type: "record", initial: supported[0] })}
            >
              <Plus size={15} />
              {addLabels[view]}
            </button>
          )}
        </div>
        <div className="work-filter">
          <input
            placeholder="Search entries"
            aria-label="Search entries"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {names.length > 0 && (
            <select
              aria-label="Filter register"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {options(names, "All registers")}
            </select>
          )}
          {view === "Expenses" && canWrite && (
            <button
              className="secondary"
              onClick={() => open({ type: "record", initial: "settlement" })}
            >
              Pay supplier baki
            </button>
          )}
        </div>
        <Table
          headers={[
            "Date",
            "Register / party",
            "Particulars",
            "Amount",
            "State",
            ...(canWrite ? ["Action"] : []),
          ]}
          rows={entries.map((r) => [
            r.day,
            [
              r.category,
              r.party,
              book.workers.find((w) => w.id === r.workerId)?.name,
            ]
              .filter(Boolean)
              .join(" · "),
            [r.reference, r.detail.challan, r.memo, r.voidReason]
              .filter(Boolean)
              .join(" · ") || "—",
            money(r.amount),
            r.voidedAt ? "Voided" : r.invoiceId ? "Invoiced" : "Posted",
            ...(canWrite
              ? [
                  !r.voidedAt ? (
                    <div className="button-group">
                      {r.kind === "sale" && (
                        <button
                          className="text-btn"
                          onClick={() => open({ type: "jama", row: r })}
                        >
                          Jama details
                        </button>
                      )}
                      {!r.invoiceId && (
                        <button
                          className="text-btn danger-text"
                          onClick={() => open({ type: "void", id: r.id })}
                        >
                          Void
                        </button>
                      )}
                    </div>
                  ) : (
                    "—"
                  ),
                ]
              : []),
          ])}
        />
      </section>
    </>
  );
}
function Reports({ book }) {
  const [keys, setKeys] = useState(["payroll"]);
  const query = new URLSearchParams({
    month: book.month,
    sections: keys.join(","),
  });
  return (
    <>
      <section className="work-panel">
        <h3>Export monthly reports</h3>
        <div className="report-checks">
          {Object.entries(sections).map(([k, v]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={keys.includes(k)}
                onChange={(e) =>
                  setKeys(
                    e.target.checked
                      ? [...keys, k]
                      : keys.filter((x) => x !== k),
                  )
                }
              />
              {v}
            </label>
          ))}
        </div>
        {keys.length > 0 && (
          <div className="work-actions">
            <div className="button-group">
              {["pdf", "csv"].map((f) => (
                <a
                  className={f === "pdf" ? "primary" : "secondary"}
                  key={f}
                  href={"/api/workshop?" + query + "&format=" + f}
                  download
                >
                  <ArrowDownToLine size={16} /> Download {f.toUpperCase()}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
      <ReportPreview tables={reportTables(book, keys)} />
    </>
  );
}
function Settings({ book, user, open }) {
  const [audit, setAudit] = useState(null),
    [error, setError] = useState("");
  async function fetchAudit() {
    try {
      const r = await fetch("/api/workshop?audit=1");
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setAudit(data);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <section className="work-panel">
        <div className="work-actions">
          <h3>Seller profile</h3>
          {user.role === "owner" && (
            <button
              className="secondary"
              onClick={() => open({ type: "profile" })}
            >
              <Settings2 size={15} /> Edit seller
            </button>
          )}
        </div>
        <p>
          <b>{book.profile.name}</b>
        </p>
        <p>
          {[book.profile.address, book.profile.contact, book.profile.taxId]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p>{book.profile.terms}</p>
      </section>
      {user.role === "owner" && (
        <section className="work-panel">
          <div className="work-actions">
            <h3>Recent audit history</h3>
            <button className="secondary" onClick={fetchAudit}>
              Load activity
            </button>
          </div>
          {error && <Notice error>{error}</Notice>}
          {audit && (
            <Table
              headers={["Date & time", "Staff", "Action", "Record"]}
              rows={audit.map((r) => [
                new Date(r.at).toLocaleString("en-IN"),
                r.actor,
                r.action,
                r.recordId,
              ])}
            />
          )}
        </section>
      )}
    </>
  );
}
export default function Workshop({ user, today, notify, onBillingChange }) {
  const [month, setMonth] = useState(today.slice(0, 7)),
    [view, setView] = useState("Monthly result"),
    [book, setBook] = useState(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [version, setVersion] = useState(0);
  const attempt = useRef(null);
  useEffect(() => {
    let active = true;
    setBook(null);
    setError("");
    fetch("/api/workshop?month=" + month, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (r.status === 401) window.location.reload();
        if (!r.ok) throw Error(v.error);
        if (active) setBook(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [month, version]);
  const open = (m) => {
    setActionError("");
    attempt.current = null;
    setModal(m);
  };
  const save = async (action, fields, after) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    const body = JSON.stringify({ action, ...fields });
    if (attempt.current?.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    try {
      const r = await fetch("/api/workshop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body,
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      attempt.current = null;
      after?.();
      setModal(null);
      setVersion((v) => v + 1);
      onBillingChange();
      notify("Workshop records saved");
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const canWrite = user.role !== "viewer",
    close = () => {
      if (!busy) {
        setModal(null);
        setActionError("");
      }
    };
  return (
    <div className="workdesk">
      <div className="work-period">
        <label>
          <CalendarDays size={16} />
          <span>Accounting month</span>
          <input
            type="month"
            aria-label="Accounting month"
            value={month}
            max={today.slice(0, 7)}
            onChange={(e) => {
              if (e.target.value && e.target.validity.valid) {
                setMonth(e.target.value);
                setActionError("");
              }
            }}
          />
        </label>
      </div>
      <div className="work-tabs" aria-label="Workshop sections">
        {views.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === view}
            onClick={() => {
              setView(v);
              setActionError("");
            }}
          >
            {viewLabels[v] || v}
          </button>
        ))}
      </div>
      {error && (
        <>
          <Notice error>{error}</Notice>
          <button
            className="secondary"
            onClick={() => setVersion((v) => v + 1)}
          >
            Retry
          </button>
        </>
      )}
      {actionError && !modal && <Notice error>{actionError}</Notice>}
      {!book && !error && (
        <p role="status" className="loading">
          <RefreshCw size={16} /> Loading factory accounts…
        </p>
      )}
      {book && (
        <>
          {view === "Monthly result" && (
            <>
              <div className="month-hero">
                <div>
                  <p className="folio-label">I SHREE ENTERPRISE · MONTHLY PERFORMANCE</p>
                  <h2>{monthTitle(book.month)}</h2>
                  <span>Factory jobwork, net revenue and operational accounts</span>
                </div>
                <strong>{money(book.totals.profit)}</strong>
              </div>
              <div className="work-stats">
                <Stat
                  label="Monthly sales"
                  amount={book.totals.sales}
                  icon={ReceiptText}
                />
                <Stat
                  label="Monthly costs"
                  amount={book.totals.costs}
                  icon={Boxes}
                />
                <Stat
                  label="Payroll due"
                  amount={book.totals.payrollDue}
                  icon={Users}
                />
                <Stat
                  label="Cash + bank"
                  amount={book.totals.closing}
                  icon={Wallet}
                />
              </div>
              <div className="work-shortcuts">
                {[
                  [ClipboardCheck, "Attendance"],
                  [BookOpen, "Rojmel"],
                  [FileText, "Reports"],
                ].map(([Icon, name]) => (
                  <button key={name} onClick={() => setView(name)}>
                    <Icon size={18} />
                    {name}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
              <ReportPreview tables={reportTables(book, ["summary"])} />
            </>
          )}
          {view === "Attendance" && (
            <Attendance
              key={book.month}
              {...{ book, today, save, busy, canWrite, open }}
            />
          )}
          {categories[view] && (
            <Registers key={view} {...{ book, view, canWrite, open }} />
          )}
          {view === "Reports" && <Reports book={book} />}
          {view === "Settings" && <Settings {...{ book, user, open }} />}
          {modal && (
            <Modal
              title={
                modal.type === "record"
                  ? "New ledger entry"
                  : modal.type === "worker"
                    ? "Worker details"
                    : modal.type === "profile"
                      ? "Edit seller profile"
                      : modal.type === "jama"
                        ? "Jama details"
                        : "Void entry"
              }
              wide
              onClose={close}
            >
              {actionError && <Notice error>{actionError}</Notice>}
              {modal.type === "worker" && (
                <WorkerForm worker={modal.worker} {...{ save, busy, close }} />
              )}
              {modal.type === "record" && (
                <RecordForm
                  {...{ book, today, save, busy, close }}
                  initial={modal.initial}
                />
              )}
              {modal.type === "profile" && (
                <ProfileForm
                  profile={book.profile}
                  {...{ save, busy, close }}
                />
              )}
              {modal.type === "jama" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = Object.fromEntries(new FormData(e.currentTarget));
                    save("jama", {
                      ...v,
                      id: modal.row.id,
                      previous: [
                        modal.row.detail.jamaDate || "",
                        modal.row.detail.jamaBill || "",
                      ],
                    });
                  }}
                >
                  <div className="form-grid">
                    <Field name="Jama date">
                      <input
                        type="date"
                        name="jamaDate"
                        min={modal.row.day}
                        defaultValue={modal.row.detail.jamaDate}
                      />
                    </Field>
                    <Field name="Jama bill number">
                      <input
                        name="jamaBill"
                        maxLength="50"
                        defaultValue={modal.row.detail.jamaBill}
                      />
                    </Field>
                  </div>
                  <div className="form-actions">
                    <button className="primary" disabled={busy}>
                      Save jama details
                    </button>
                  </div>
                </form>
              )}
              {modal.type === "void" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("void", {
                      id: modal.id,
                      reason: new FormData(e.currentTarget).get("reason"),
                    });
                  }}
                >
                  <Field name="Reason for voiding">
                    <textarea name="reason" required maxLength="250" />
                  </Field>
                  <div className="form-actions">
                    <button className="secondary" type="button" onClick={close}>
                      Cancel
                    </button>
                    <button className="danger" disabled={busy}>
                      Void entry
                    </button>
                  </div>
                </form>
              )}
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
