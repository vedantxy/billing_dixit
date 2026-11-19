import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  CreditCard,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  cadences,
  deduplicateLines,
  invoiceNumber,
  methods,
  money,
  niceDate,
  statuses,
} from "../lib/billing.mjs";
import { sections as workshopSections } from "../lib/workshop.mjs";
import { Badge, CustomerName, Field, Modal, Notice } from "./ui.jsx";
import {
  ChangePlan,
  CustomerForm,
  InvoiceForm,
  PaymentForm,
  PlanForm,
  ProductForm,
  SubscriptionForm,
} from "./Forms.jsx";

function Facts({ rows }) {
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
function History({ title, rows, empty }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="history">
          {rows.map((row) => (
            <button type="button" key={row.key} onClick={row.open}>
              <span>
                <strong>{row.title}</strong>
                <small>{row.caption}</small>
              </span>
              <b>{row.value}</b>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}
function CustomerDetail({ modal, book, stats, open, save, busy, close }) {
  const c = book.customers.find((x) => x.id === modal.id),
    [confirm, setConfirm] = useState(false);
  const invoices = stats.invoices.filter((i) => i.customerId === c.id);
  const payments = invoices
    .flatMap((i) => i.payments.map((p) => ({ ...p, inv: i })))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const subs = book.subscriptions.filter((s) => s.customerId === c.id);
  return (
    <>
      <div className="detail-lead">
        <CustomerName name={c.name} sub={c.email} />
        <Badge value={c.archived ? "archived" : "active"} />
      </div>
      <Facts
        rows={[
          ["Phone", c.phone],
          ["Billing address", c.address],
          ["Added", niceDate(c.createdOn, true)],
          [
            "Outstanding",
            money(
              invoices
                .filter((i) => ["pending", "overdue"].includes(i.status))
                .reduce((sum, i) => sum + i.balance, 0),
            ),
          ],
        ]}
      />
      <div className="action-row">
        <button
          className="secondary"
          onClick={() => open("customerForm", c.id)}
        >
          <Pencil size={14} />
          Edit profile
        </button>
        {!c.archived && (
          <>
            <button
              className="secondary"
              onClick={() =>
                open("subscriptionForm", null, { customerId: c.id })
              }
            >
              <Plus size={14} />
              Subscription
            </button>
            <button
              className="secondary"
              onClick={() => open("invoiceForm", null, { customerId: c.id })}
            >
              <FilePlus2 size={14} />
              Invoice
            </button>
          </>
        )}
      </div>
      <History
        title="Subscriptions"
        empty="No subscriptions yet."
        rows={subs.map((s) => ({
          key: s.id,
          title: s.planLabel,
          caption: statuses[s.status],
          value: money(s.price),
          open: () => open("subscription", s.id),
        }))}
      />
      <History
        title="Invoices"
        empty="No invoices yet."
        rows={invoices.map((i) => ({
          key: i.id,
          title: invoiceNumber(i.sequence),
          caption: statuses[i.status] + " · " + niceDate(i.issuedOn, true),
          value: money(i.total),
          open: () => open("invoice", i.id),
        }))}
      />
      <History
        title="Payments"
        empty="No payments recorded."
        rows={payments.map((p) => ({
          key: p.id,
          title: methods[p.method] + " · " + statuses[p.status],
          caption:
            invoiceNumber(p.inv.sequence) + " · " + niceDate(p.paidOn, true),
          value: money(p.amount),
          open: () => open("payment", p.id),
        }))}
      />
      <div className="detail-section">
        {c.archived ? (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              save(
                "customers/" + c.id,
                "PATCH",
                { action: "restore" },
                "Customer restored",
                close,
              )
            }
          >
            Restore customer
          </button>
        ) : confirm ? (
          <div className="confirm">
            <p>
              {subs.length || invoices.length
                ? "Archive this profile and keep its billing history?"
                : "Permanently delete this customer?"}
            </p>
            <button className="secondary" onClick={() => setConfirm(false)}>
              Keep customer
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                save(
                  "customers/" + c.id,
                  "DELETE",
                  {},
                  subs.length || invoices.length
                    ? "Customer archived"
                    : "Customer deleted",
                  close,
                )
              }
            >
              Confirm removal
            </button>
          </div>
        ) : (
          <button
            className="text-btn danger-text"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={14} />
            Remove customer
          </button>
        )}
      </div>
    </>
  );
}
function SubscriptionDetail({ modal, book, stats, today, open, save, busy }) {
  const s = book.subscriptions.find((x) => x.id === modal.id),
    c = book.customers.find((c) => c.id === s.customerId);
  const [confirm, setConfirm] = useState(false);
  const events = book.events
    .filter((e) => e.subscriptionId === s.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const invoices = stats.invoices.filter((i) => i.subscriptionId === s.id);
  const status = (v) =>
    save(
      "subscriptions/" + s.id,
      "PATCH",
      { action: "status", status: v },
      "Subscription " + statuses[v].toLowerCase(),
      () => setConfirm(false),
    );
  return (
    <>
      <div className="detail-lead">
        <CustomerName name={c.name} sub={s.planLabel} />
        <Badge value={s.status} />
      </div>
      <Facts
        rows={[
          ["Renewal amount", money(s.price)],
          ["Interval", cadences[s.cadence]],
          ["Start date", niceDate(s.startDate, true)],
          [
            "Next billing",
            s.status === "cancelled" ? "—" : niceDate(s.nextDate, true),
          ],
        ]}
      />
      {s.status !== "cancelled" && (
        <>
          <div className="action-row">
            <button
              className="secondary"
              onClick={() => open("changePlan", s.id)}
            >
              Change plan
            </button>
            {s.status === "active" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => status("paused")}
              >
                Pause
              </button>
            )}
            {s.status !== "active" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => status("active")}
              >
                Resume
              </button>
            )}
            {s.status === "active" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => status("past_due")}
              >
                Mark past due
              </button>
            )}
            {s.status !== "paused" && (
              <button
                className="secondary"
                onClick={() =>
                  open("invoiceForm", null, {
                    customerId: c.id,
                    subscriptionId: s.id,
                  })
                }
              >
                <FilePlus2 size={14} />
                New invoice
              </button>
            )}
          </div>
          {s.nextDate <= today && s.status !== "paused" && (
            <div className="renew-action">
              <div>
                <strong>Renewal due</strong>
                <small>
                  Generate the invoice and advance one billing cycle.
                </small>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  save(
                    "subscriptions/" + s.id,
                    "PATCH",
                    { action: "renew", expectedNextDate: s.nextDate },
                    "Renewal invoiced",
                    (i) => open("invoice", i.id),
                  )
                }
              >
                <RefreshCw size={14} />
                Renew
              </button>
            </div>
          )}
        </>
      )}
      <History
        title="Subscription invoices"
        empty="No invoices for this subscription."
        rows={invoices.map((i) => ({
          key: i.id,
          title: invoiceNumber(i.sequence),
          caption: statuses[i.status] + " · " + niceDate(i.issuedOn, true),
          value: money(i.total),
          open: () => open("invoice", i.id),
        }))}
      />
      <section className="detail-section">
        <h3>Subscription history</h3>
        <ol className="timeline">
          {events.map((e) => (
            <li key={e.id}>
              <small>{niceDate(e.at, true)}</small>
              <span>{e.message}</span>
            </li>
          ))}
        </ol>
      </section>
      {s.status !== "cancelled" && (
        <div className="detail-section">
          {confirm ? (
            <div className="confirm">
              <p>Cancel this subscription and stop future renewals?</p>
              <button className="secondary" onClick={() => setConfirm(false)}>
                Keep subscription
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => status("cancelled")}
              >
                Confirm cancellation
              </button>
            </div>
          ) : (
            <button
              className="text-btn danger-text"
              onClick={() => setConfirm(true)}
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}
    </>
  );
}
function InvoiceDetail({ modal, stats, open, save, busy }) {
  const i = stats.invoices.find((x) => x.id === modal.id);
  const displayLines = deduplicateLines(i?.lines || []);
  return (
    <>
      <div className="detail-lead">
        <CustomerName name={i.billTo} sub={i.billEmail} />
        <Badge value={i.status} />
      </div>
      <Facts
        rows={[
          ["Issued on", niceDate(i.issuedOn, true)],
          ["Due on", niceDate(i.dueOn, true)],
          ["Billing address", i.billAddress],
          [
            "Billing type",
            i.subscriptionId ? "Subscription" : "One-time purchase",
          ],
        ]}
      />
      <div className="table-scroll detail-table">
        <table>
          <thead>
            <tr>
              <th>Line item</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {displayLines.map((l, idx) => (
              <tr key={l.id || idx}>
                <td>{l.description}</td>
                <td>{l.quantity}</td>
                <td>{money(l.unitPrice)}</td>
                <td>{money(l.quantity * l.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="invoice-math">
        <span>
          Subtotal <b>{money(i.subtotal)}</b>
        </span>
        <span>
          Discount ({i.discountBps / 100}%) <b>−{money(i.discount)}</b>
        </span>
        <span>
          Tax ({i.taxBps / 100}%) <b>{money(i.tax)}</b>
        </span>
        <span>
          Total <b>{money(i.total)}</b>
        </span>
        <span>
          Received <b>{money(i.collected)}</b>
        </span>
        <strong>
          Balance due <b>{money(i.balance)}</b>
        </strong>
      </div>
      {i.workshopAnnex && (
        <section className="detail-section">
          <h3>Attached workshop statement</h3>
          <p>
            {i.workshopAnnex.month} ·{" "}
            {i.workshopAnnex.sections
              .map((key) => workshopSections[key])
              .join(", ")}
          </p>
        </section>
      )}
      {i.notes && (
        <section className="detail-section">
          <h3>Notes</h3>
          <p className="prewrap">{i.notes}</p>
        </section>
      )}
      <div className="action-row">
        <a
          className="secondary"
          href={"/api/invoices/" + i.id + "/pdf"}
          download
        >
          <ArrowDownToLine size={15} />
          Download PDF
        </a>
        {i.stage === "draft" ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              save(
                "invoices/" + i.id,
                "PATCH",
                { action: "issue" },
                "Invoice issued",
                () => {},
              )
            }
          >
            Issue invoice
          </button>
        ) : (
          i.balance > 0 && (
            <button
              className="primary"
              onClick={() => open("paymentForm", null, { invoiceId: i.id })}
            >
              <CreditCard size={15} />
              Record payment
            </button>
          )
        )}
      </div>
      <History
        title="Payment history"
        empty="No payments recorded."
        rows={i.payments.map((p) => ({
          key: p.id,
          title: methods[p.method] + " · " + statuses[p.status],
          caption: niceDate(p.paidOn, true),
          value: money(p.amount),
          open: () => open("payment", p.id),
        }))}
      />
    </>
  );
}
function PaymentDetail({ modal, book, stats, open, save, busy }) {
  const p = book.payments.find((x) => x.id === modal.id),
    i = stats.invoices.find((i) => i.id === p.invoiceId);
  const [status, setStatus] = useState(p.status);
  return (
    <>
      <div className="detail-lead">
        <CustomerName name={i.billTo} sub={invoiceNumber(i.sequence)} />
        <Badge value={p.status} />
      </div>
      <Facts
        rows={[
          ["Payment amount", money(p.amount)],
          ["Date", niceDate(p.paidOn, true)],
          ["Method", methods[p.method]],
          ["Invoice balance", money(i.balance)],
        ]}
      />
      <button className="text-btn" onClick={() => open("invoice", i.id)}>
        View invoice <ChevronRight size={14} />
      </button>
      <form
        className="detail-section"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            "payments/" + p.id,
            "PATCH",
            { status },
            "Payment status updated",
            () => {},
          );
        }}
      >
        <Field name="Payment status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["pending", "successful", "failed"].map((s) => (
              <option key={s} value={s}>
                {statuses[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <button className="primary" disabled={busy || status === p.status}>
            Update status
          </button>
        </div>
      </form>
    </>
  );
}
const types = {
  customerForm: ["Customer", CustomerForm],
  productForm: ["Product", ProductForm],
  planForm: ["Pricing plan", PlanForm],
  subscriptionForm: ["New subscription", SubscriptionForm],
  changePlan: ["Change pricing plan", ChangePlan],
  invoiceForm: ["New invoice", InvoiceForm],
  paymentForm: ["Record payment", PaymentForm],
  customer: ["Customer profile", CustomerDetail],
  subscription: ["Subscription details", SubscriptionDetail],
  invoice: ["Invoice", InvoiceDetail],
  payment: ["Payment details", PaymentDetail],
};
export default function Dialogs(props) {
  const { modal, book, notify, close, write } = props;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    attempt = useRef(null);
  const safeClose = () => {
    if (!pending.current) close();
  };
  async function save(url, method, data, message, after) {
    if (pending.current) return;
    const signature = JSON.stringify([url, method, data]);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await write(url, method, data, attempt.current.key);
      attempt.current = null;
      pending.current = false;
      notify(message);
      after(result);
    } catch (e) {
      setError(e.message || "Could not save. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const existsIn = {
    customer: "customers",
    subscription: "subscriptions",
    invoice: "invoices",
    payment: "payments",
  }[modal.type];
  if (existsIn && !book[existsIn].some((row) => row.id === modal.id))
    return null;
  const [base, Body] = types[modal.type];
  let title = base;
  if (["customerForm", "productForm", "planForm"].includes(modal.type))
    title = (modal.id ? "Edit " : "New ") + base.toLowerCase();
  if (modal.type === "invoice")
    title = invoiceNumber(
      book.invoices.find((i) => i.id === modal.id).sequence,
    );
  return (
    <Modal
      title={title}
      onClose={safeClose}
      wide={["invoice", "invoiceForm", "customer"].includes(modal.type)}
    >
      {error && <Notice error>{error}</Notice>}
      <Body {...props} save={save} busy={busy} close={safeClose} />
    </Modal>
  );
}
