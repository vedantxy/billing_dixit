import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  cadences,
  invoiceNumber,
  invoiceTotals,
  methods,
  money,
  nextCycle,
  plusDays,
  statuses,
} from "../lib/billing.mjs";
import InvoiceWorkshopPicker from "./InvoiceWorkshopPicker.jsx";
import { Field } from "./ui.jsx";

const formValues = (event) =>
  Object.fromEntries(new FormData(event.currentTarget));
const cents = (value) => Math.round(Number(value || 0) * 100);
const opt = (value, label) => (
  <option key={value} value={value}>
    {label}
  </option>
);
const opts = (map) => Object.entries(map).map(([v, t]) => opt(v, t));
const textInput = (
  name,
  value,
  required = false,
  maxLength = 150,
  type = "text",
) => (
  <input
    name={name}
    type={type}
    defaultValue={value || ""}
    maxLength={maxLength}
    required={required}
  />
);
const checkbox = (title, value) => (
  <label className="check">
    <input name="enabled" type="checkbox" defaultChecked={value} />
    {title}
  </label>
);
function FormFooter({ busy, label, close, disabled }) {
  return (
    <div className="form-actions">
      <button
        type="button"
        className="secondary"
        onClick={close}
        disabled={busy}
      >
        Cancel
      </button>
      <button className="primary" disabled={busy || disabled}>
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
const currentCustomers = (book) =>
  book.customers
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
function availablePlans(book) {
  return book.plans.filter(
    (p) =>
      p.enabled &&
      book.products.find((prod) => prod.id === p.productId)?.enabled,
  );
}
function planName(book, p) {
  return (
    book.products.find((prod) => prod.id === p.productId)?.name +
    " · " +
    p.name +
    " · " +
    money(p.price) +
    " (" +
    cadences[p.cadence] +
    ")"
  );
}
export function CustomerForm({ modal, book, save, busy, close, open }) {
  const c = book.customers.find((x) => x.id === modal.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(
          c ? "customers/" + c.id : "customers",
          c ? "PATCH" : "POST",
          formValues(e),
          "Customer saved",
          (r) => open("customer", r.id),
        );
      }}
    >
      <div className="form-grid">
        <Field name="Customer name" wide>
          {textInput("name", c?.name, true)}
        </Field>
        <Field name="Email">
          {textInput("email", c?.email, true, 254, "email")}
        </Field>
        <Field name="Phone">
          {textInput("phone", c?.phone, false, 40, "tel")}
        </Field>
        <Field name="Billing address" wide>
          <textarea
            name="address"
            rows="3"
            maxLength="500"
            defaultValue={c?.address || ""}
          />
        </Field>
      </div>
      <FormFooter busy={busy} label="Save customer" close={close} />
    </form>
  );
}
export function ProductForm({ modal, book, save, busy, close }) {
  const p = book.products.find((x) => x.id === modal.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e);
        save(
          p ? "products/" + p.id : "products",
          p ? "PATCH" : "POST",
          { ...v, enabled: v.enabled === "on" },
          "Product saved",
          close,
        );
      }}
    >
      <div className="form-grid">
        <Field name="Product name" wide>
          {textInput("name", p?.name, true)}
        </Field>
        <Field name="Description" wide>
          <textarea
            name="description"
            rows="3"
            maxLength="500"
            defaultValue={p?.description || ""}
          />
        </Field>
        {checkbox("Product enabled", p?.enabled ?? true)}
      </div>
      <FormFooter busy={busy} label="Save product" close={close} />
    </form>
  );
}
export function PlanForm({ modal, book, save, busy, close }) {
  const p = book.plans.find((x) => x.id === modal.id),
    productId = p?.productId || modal.productId;
  const product = book.products.find((x) => x.id === productId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e);
        save(
          p ? "plans/" + p.id : "plans",
          p ? "PATCH" : "POST",
          {
            productId,
            name: v.name,
            price: cents(v.price),
            cadence: v.cadence,
            enabled: v.enabled === "on",
          },
          "Pricing plan saved",
          close,
        );
      }}
    >
      <p className="form-intro">{product?.name}</p>
      <div className="form-grid">
        <Field name="Plan name" wide>
          {textInput("name", p?.name, true)}
        </Field>
        <Field name="Price (₹)">
          <input
            name="price"
            type="number"
            min="0.01"
            step="0.01"
            max="20000000"
            defaultValue={p ? p.price / 100 : ""}
            required
          />
        </Field>
        <Field name="Billing interval">
          <select name="cadence" defaultValue={p?.cadence || "monthly"}>
            {opts(cadences)}
          </select>
        </Field>
        {checkbox("Plan enabled", p?.enabled ?? true)}
      </div>
      <FormFooter busy={busy} label="Save plan" close={close} />
    </form>
  );
}
export function SubscriptionForm({
  modal,
  book,
  today,
  save,
  busy,
  close,
  open,
}) {
  const [start, setStart] = useState(today),
    [planId, setPlanId] = useState(""),
    [next, setNext] = useState("");
  const plans = availablePlans(book).filter((p) => p.cadence !== "once"),
    clients = currentCustomers(book);
  const cadence = plans.find((p) => p.id === planId)?.cadence || "monthly";
  const suggested = start ? nextCycle(start, cadence) : "";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e);
        save(
          "subscriptions",
          "POST",
          {
            customerId: v.customerId,
            planId,
            startDate: start,
            nextDate: next || suggested,
          },
          "Subscription created",
          (r) => open("subscription", r.id),
        );
      }}
    >
      <div className="form-grid">
        <Field name="Customer" wide>
          <select
            name="customerId"
            defaultValue={modal.customerId || ""}
            required
          >
            <option value="">Select customer</option>
            {clients.map((c) => opt(c.id, c.name))}
          </select>
        </Field>
        <Field name="Recurring plan" wide>
          <select
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setNext("");
            }}
            required
          >
            <option value="">Select a plan</option>
            {plans.map((p) => opt(p.id, planName(book, p)))}
          </select>
        </Field>
        <Field name="Start date">
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setNext("");
            }}
            required
          />
        </Field>
        <Field name="Next billing date">
          <input
            type="date"
            min={start ? plusDays(start, 1) : undefined}
            value={next || suggested}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </Field>
      </div>
      {(!plans.length || !clients.length) && (
        <p className="form-intro">
          Add a customer and an enabled recurring plan first.
        </p>
      )}
      <FormFooter
        busy={busy}
        label="Create subscription"
        close={close}
        disabled={!plans.length || !clients.length}
      />
    </form>
  );
}
export function ChangePlan({ modal, book, save, busy, close, open }) {
  const sub = book.subscriptions.find((s) => s.id === modal.id);
  const plans = availablePlans(book).filter(
    (p) =>
      p.cadence !== "once" &&
      (p.id !== sub.planId ||
        p.price !== sub.price ||
        p.cadence !== sub.cadence),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(
          "subscriptions/" + sub.id,
          "PATCH",
          { action: "change_plan", planId: formValues(e).planId },
          "Subscription plan changed",
          () => open("subscription", sub.id),
        );
      }}
    >
      <p className="form-intro">
        Current plan: {sub.planLabel}. The new price applies on the next billing
        date.
      </p>
      <Field name="New plan">
        <select name="planId" defaultValue="" required>
          <option value="">Select a plan</option>
          {plans.map((p) => opt(p.id, planName(book, p)))}
        </select>
      </Field>
      <FormFooter
        busy={busy}
        label="Change plan"
        disabled={!plans.length}
        close={close}
      />
    </form>
  );
}
const blankLine = () => ({
  key: crypto.randomUUID(),
  planId: "",
  description: "",
  quantity: "1",
  price: "",
});
export function InvoiceForm({ modal, book, today, save, busy, close, open }) {
  const [client, setClient] = useState(modal.customerId || ""),
    [subId, setSubId] = useState(modal.subscriptionId || "");
  const [lines, setLines] = useState(() =>
    modal.subscriptionId ? [] : [blankLine()],
  );
  const [discount, setDiscount] = useState("0"),
    [tax, setTax] = useState("0"),
    [stage, setStage] = useState("issued");
  const [issued, setIssued] = useState(today),
    [due, setDue] = useState(plusDays(today, 7));
  const emptyWorkshop = { month: "", items: [], sections: [] };
  const [workshop, setWorkshop] = useState(emptyWorkshop);
  const hasSource = workshop.items.length > 0;
  const sub = book.subscriptions.find((s) => s.id === subId);
  const possibleSubs = book.subscriptions.filter(
    (s) => s.customerId === client && ["active", "past_due"].includes(s.status),
  );
  const catalog = availablePlans(book).filter((p) => p.cadence === "once"),
    customers = currentCustomers(book);
  const update = (key, patch) =>
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  const pick = (line, id) => {
    const p = catalog.find((p) => p.id === id);
    update(line.key, {
      planId: id,
      description: p
        ? book.products.find((x) => x.id === p.productId).name + " · " + p.name
        : "",
      price: p ? String(p.price / 100) : "",
    });
  };
  const payload = lines
    .filter((l) => !hasSource || l.description || l.price || l.planId)
    .map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: cents(l.price),
      ...(l.planId ? { planId: l.planId } : {}),
    }));
  const totals = invoiceTotals(
    [
      ...(sub ? [{ quantity: 1, unitPrice: sub.price }] : []),
      ...payload,
      ...workshop.items.map((x) => ({ quantity: 1, unitPrice: x.amount })),
    ],
    cents(discount),
    cents(tax),
  );
  function chooseSub(id) {
    setSubId(id);
    if (id && lines.length === 1 && !lines[0].description && !lines[0].price)
      setLines([]);
    if (!id && !lines.length) setLines([blankLine()]);
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e);
        save(
          "invoices",
          "POST",
          {
            customerId: client,
            subscriptionId: subId || null,
            stage,
            issuedOn: issued,
            dueOn: due,
            discountBps: cents(discount),
            taxBps: cents(tax),
            lines: payload,
            ...(hasSource || workshop.sections.length
              ? {
                  workshop: {
                    month: workshop.month || issued.slice(0, 7),
                    ids: workshop.items.map((x) => x.id),
                    sections: workshop.sections,
                  },
                }
              : {}),
            notes: v.notes,
          },
          "Invoice created",
          (r) => open("invoice", r.id),
        );
      }}
    >
      <div className="form-grid">
        <Field name="Customer">
          <select
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setWorkshop(emptyWorkshop);
              chooseSub("");
            }}
            required
          >
            <option value="">Select customer</option>
            {customers.map((c) => opt(c.id, c.name))}
          </select>
        </Field>
        <Field name="Invoice for">
          <select value={subId} onChange={(e) => chooseSub(e.target.value)}>
            <option value="">One-time purchase</option>
            {possibleSubs.map((s) => opt(s.id, s.planLabel))}
          </select>
        </Field>
        <Field name="Invoice date">
          <input
            type="date"
            value={issued}
            max={today}
            required
            onChange={(e) => {
              setIssued(e.target.value);
              setWorkshop(emptyWorkshop);
            }}
          />
        </Field>
        <Field name="Due date">
          <input
            type="date"
            min={issued}
            value={due}
            required
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
      </div>
      <InvoiceWorkshopPicker
        client={client}
        day={issued}
        choice={workshop}
        onChange={setWorkshop}
      />
      <div className="line-heading">
        <h3>Line items</h3>
        <button
          type="button"
          className="text-btn"
          disabled={lines.length + (sub ? 1 : 0) >= 50}
          onClick={() => setLines([...lines, blankLine()])}
        >
          <Plus size={14} />
          Add item
        </button>
      </div>
      {sub && (
        <div className="sub-line">
          <span>{sub.planLabel}</span>
          <b>{money(sub.price)}</b>
        </div>
      )}
      {lines.map((l, i) => (
        <div className="line-editor" key={l.key}>
          <div className="line-type">
            <select
              aria-label={"Item " + (i + 1) + " type"}
              value={l.planId}
              onChange={(e) => pick(l, e.target.value)}
            >
              <option value="">Custom item</option>
              {catalog.map((p) => opt(p.id, planName(book, p)))}
            </select>
            <button
              aria-label={"Remove item " + (i + 1)}
              type="button"
              className="row-action"
              disabled={lines.length === 1 && !sub && !hasSource}
              onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="line-fields">
            <Field name="Description">
              <input
                value={l.description}
                maxLength="200"
                onChange={(e) => update(l.key, { description: e.target.value })}
                readOnly={!!l.planId}
                required={
                  !hasSource || !!(l.description || l.price || l.planId)
                }
              />
            </Field>
            <Field name="Qty">
              <input
                type="number"
                min="1"
                max="10000"
                value={l.quantity}
                onChange={(e) => update(l.key, { quantity: e.target.value })}
                required
              />
            </Field>
            <Field name="Unit price (₹)">
              <input
                type="number"
                min="0"
                max="20000000"
                step="0.01"
                value={l.price}
                onChange={(e) => update(l.key, { price: e.target.value })}
                readOnly={!!l.planId}
                required={
                  !hasSource || !!(l.description || l.price || l.planId)
                }
              />
            </Field>
          </div>
        </div>
      ))}
      <div className="form-grid">
        <Field name="Discount (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </Field>
        <Field name="Tax (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
          />
        </Field>
        <Field name="Notes" wide>
          <textarea name="notes" rows="2" maxLength="1000" />
        </Field>
        <Field name="Save as">
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="issued">Issued invoice</option>
            <option value="draft">Draft invoice</option>
          </select>
        </Field>
      </div>
      <div className="invoice-math">
        <span>
          Subtotal <b>{money(totals.subtotal)}</b>
        </span>
        <span>
          Discount <b>−{money(totals.discount)}</b>
        </span>
        <span>
          Tax <b>{money(totals.tax)}</b>
        </span>
        <strong>
          Total <b>{money(totals.total)}</b>
        </strong>
      </div>
      {!customers.length && (
        <p className="form-intro">Add a customer before creating an invoice.</p>
      )}
      <FormFooter
        busy={busy}
        label={stage === "draft" ? "Save draft" : "Create invoice"}
        close={close}
        disabled={!customers.length}
      />
    </form>
  );
}
export function PaymentForm({ modal, stats, today, save, busy, close, open }) {
  const choices = stats.open;
  const [id, setId] = useState(modal.invoiceId || ""),
    invoice = choices.find((i) => i.id === id);
  const [amount, setAmount] = useState(
    invoice ? String(invoice.balance / 100) : "",
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e);
        save(
          "payments",
          "POST",
          {
            invoiceId: id,
            amount: cents(amount),
            paidOn: v.paidOn,
            method: v.method,
            status: v.status,
          },
          "Payment recorded",
          (r) => open("payment", r.id),
        );
      }}
    >
      <div className="form-grid">
        <Field name="Invoice" wide>
          <select
            value={id}
            required
            onChange={(e) => {
              setId(e.target.value);
              const i = choices.find((x) => x.id === e.target.value);
              setAmount(i ? String(i.balance / 100) : "");
            }}
          >
            <option value="">Select an open invoice</option>
            {choices.map((i) =>
              opt(
                i.id,
                invoiceNumber(i.sequence) +
                  " · " +
                  i.billTo +
                  " · " +
                  money(i.balance),
              ),
            )}
          </select>
        </Field>
        <Field
          name="Amount (₹)"
          help={invoice && "Remaining balance " + money(invoice.balance)}
        >
          <input
            type="number"
            min=".01"
            max={invoice ? invoice.balance / 100 : undefined}
            step=".01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field name="Payment date">
          <input
            type="date"
            name="paidOn"
            defaultValue={today}
            max={today}
            min={invoice?.issuedOn}
            required
          />
        </Field>
        <Field name="Method">
          <select name="method">{opts(methods)}</select>
        </Field>
        <Field name="Payment status">
          <select name="status">
            {["successful", "pending", "failed"].map((s) =>
              opt(s, statuses[s]),
            )}
          </select>
        </Field>
      </div>
      <p className="form-intro">
        Record a payment you have received or a transaction awaiting
        confirmation.
      </p>
      {!choices.length && (
        <p className="form-intro">
          Issue an invoice with a balance to record a payment.
        </p>
      )}
      <FormFooter
        busy={busy}
        label="Record payment"
        close={close}
        disabled={!choices.length}
      />
    </form>
  );
}
