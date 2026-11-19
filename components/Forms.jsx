import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Sparkles, Copy, FileText, CheckCircle2, ShoppingBag, Check, Minus, PackagePlus } from "lucide-react";
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
  hsnCode: "",
});
export function InvoiceForm({ modal, book, today, save, busy, close, open }) {
  const [client, setClient] = useState(modal.customerId || ""),
    [subId, setSubId] = useState(modal.subscriptionId || "");

  // Build complete product & plan catalog
  const productCatalog = useMemo(() => {
    const items = [];
    const plans = availablePlans(book);
    for (const p of plans) {
      const prod = book.products.find((x) => x.id === p.productId);
      items.push({
        id: p.id,
        productId: p.productId,
        title: prod ? prod.name + (p.name !== prod.name ? " · " + p.name : "") : p.name,
        name: p.name,
        price: p.price,
        cadence: p.cadence,
        hsn: "9988",
      });
    }
    // Also include enabled products
    for (const prod of book.products.filter((p) => p.enabled)) {
      if (!book.plans.some((pl) => pl.productId === prod.id && pl.enabled)) {
        items.push({
          id: "prod_" + prod.id,
          productId: prod.id,
          title: prod.name,
          name: prod.name,
          price: 0,
          cadence: "once",
          hsn: "9988",
        });
      }
    }
    return items;
  }, [book]);

  // Start with clean empty lines array — user clicks ANY product to select 1 time!
  const [lines, setLines] = useState(() => {
    return [];
  });

  const [discount, setDiscount] = useState("0"),
    [tax, setTax] = useState("18"), // Default 18% GST
    [stage, setStage] = useState("issued");
  const [issued, setIssued] = useState(today),
    [due, setDue] = useState(plusDays(today, 7));
  const [notes, setNotes] = useState("Payment terms: Net 15 days. Cheque in favor of I Shree Enterprise.");
  const [salesRecords, setSalesRecords] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const emptyWorkshop = { month: "", items: [], sections: [] };
  const [workshop, setWorkshop] = useState(emptyWorkshop);
  const hasSource = workshop.items.length > 0;
  const sub = book.subscriptions.find((s) => s.id === subId);
  const possibleSubs = book.subscriptions.filter(
    (s) => s.customerId === client && ["active", "past_due"].includes(s.status),
  );
  const customers = currentCustomers(book);

  // Find previous invoices for this customer
  const previousInvoices = client
    ? book.invoices.filter((i) => i.customerId === client && i.lines?.length)
    : [];
  const lastInvoice = previousInvoices.length ? previousInvoices[0] : null;

  // Fetch unbilled sales/challans from workshop records for this customer
  useEffect(() => {
    if (!client) {
      setSalesRecords([]);
      return;
    }
    let active = true;
    setLoadingSales(true);
    fetch("/api/workshop?month=" + issued.slice(0, 7))
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.records) {
          const unbilled = d.records.filter(
            (r) =>
              r.customerId === client &&
              !r.voidedAt &&
              !r.invoiceId &&
              r.amount > 0 &&
              ["sale", "expense", "material"].includes(r.kind),
          );
          setSalesRecords(unbilled);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingSales(false);
      });
    return () => {
      active = false;
    };
  }, [client, issued]);

  // 1-Click Direct Select Product (adds 1 time or toggles off if clicked again)
  function selectProduct(prod) {
    const existingIndex = lines.findIndex((l) => l.planId === prod.id || l.description === prod.title);
    if (existingIndex >= 0) {
      // Toggle off / remove so it is never duplicated
      setLines((curr) => curr.filter((_, i) => i !== existingIndex));
    } else {
      const newLine = {
        key: crypto.randomUUID(),
        planId: prod.id,
        description: prod.title,
        quantity: "1",
        price: String(prod.price / 100),
        hsnCode: prod.hsn || "9988",
      };
      setLines((curr) => {
        const filtered = curr.filter((l) => l.description || l.price);
        return [...filtered, newLine];
      });
    }
  }

  // Explicit quantity step on product card (+ / -)
  function stepProductQty(prod, delta, e) {
    if (e) e.stopPropagation();
    const existingIndex = lines.findIndex((l) => l.planId === prod.id || l.description === prod.title);
    if (existingIndex >= 0) {
      const currentQty = Number(lines[existingIndex].quantity || 1);
      const nextQty = currentQty + delta;
      if (nextQty <= 0) {
        setLines((curr) => curr.filter((_, i) => i !== existingIndex));
      } else {
        setLines((curr) =>
          curr.map((l, i) =>
            i === existingIndex ? { ...l, quantity: String(nextQty) } : l
          )
        );
      }
    } else if (delta > 0) {
      selectProduct(prod);
    }
  }

  // 1-Click Direct Select Factory Sale (toggles on/off, single item only)
  function selectSaleRecord(rec) {
    const title = rec.reference
      ? `${rec.reference} · ${rec.category || "Factory jobwork"}`
      : `${rec.category || "Factory delivery"} (${rec.day})`;
    const existingIndex = lines.findIndex((l) => l.saleId === rec.id || l.description === title);
    if (existingIndex >= 0) {
      // Toggle off
      setLines((curr) => curr.filter((_, i) => i !== existingIndex));
      setWorkshop((prev) => ({
        ...prev,
        items: prev.items.filter((x) => x.id !== rec.id),
      }));
    } else {
      const newLine = {
        key: crypto.randomUUID(),
        saleId: rec.id,
        planId: "",
        description: title,
        quantity: "1",
        price: (rec.amount / 100).toFixed(2),
        hsnCode: "9988",
      };
      setLines((curr) => {
        const filtered = curr.filter((l) => l.description || l.price);
        return [...filtered, newLine];
      });
      setWorkshop((prev) => ({
        ...prev,
        month: prev.month || issued.slice(0, 7),
        items: [...prev.items.filter((x) => x.id !== rec.id), { id: rec.id, amount: rec.amount }],
      }));
    }
  }

  // 1-Click Auto-generate ALL from sales/jobwork
  function autoGenerateFromSales() {
    if (!salesRecords.length) return;
    const newLines = salesRecords.map((r) => ({
      key: crypto.randomUUID(),
      saleId: r.id,
      planId: "",
      description: r.reference
        ? `${r.reference} · ${r.category || "Factory jobwork / delivery"}`
        : `${r.category || "Factory Jobwork"} (${r.day})`,
      quantity: "1",
      price: (r.amount / 100).toFixed(2),
      hsnCode: "9988",
    }));
    setLines(newLines);
    setTax("18"); // Default 18% GST
    setDiscount("0");
    setNotes(
      "Delivered against factory jobwork challans. Payment due upon receipt. Cheque / NEFT in favor of I Shree Enterprise.",
    );
    setWorkshop({
      month: issued.slice(0, 7),
      items: salesRecords.map((r) => ({ id: r.id, amount: r.amount })),
      sections: ["sales", "delivery"],
    });
  }

  // 1-Click Copy from Last Invoice
  function copyFromLastInvoice() {
    if (!lastInvoice) return;
    const newLines = (lastInvoice.lines || []).map((l) => ({
      key: crypto.randomUUID(),
      planId: l.planId || "",
      description: l.description,
      quantity: String(l.quantity || 1),
      price: (l.unitPrice / 100).toFixed(2),
      hsnCode: l.hsnCode || "",
    }));
    if (newLines.length) setLines(newLines);
    if (lastInvoice.taxBps) setTax(String(lastInvoice.taxBps / 100));
    if (lastInvoice.discountBps)
      setDiscount(String(lastInvoice.discountBps / 100));
    if (lastInvoice.notes) setNotes(lastInvoice.notes);
  }

  const update = (key, patch) =>
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  const payload = lines
    .filter((l) => l.description || l.price || l.planId || l.saleId)
    .map((l) => ({
      description: l.description,
      quantity: Number(l.quantity || 1),
      unitPrice: cents(l.price || 0),
      ...(l.planId ? { planId: l.planId } : {}),
      ...(l.hsnCode ? { hsnCode: l.hsnCode } : {}),
      ...(l.saleId ? { saleId: l.saleId } : {}),
    }));

  const totals = invoiceTotals(
    [
      ...(sub ? [{ quantity: 1, unitPrice: sub.price }] : []),
      ...payload,
      ...workshop.items
        .filter((x) => !lines.some((l) => l.saleId === x.id))
        .map((x) => ({ quantity: 1, unitPrice: x.amount })),
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
        if (payload.length === 0 && !sub && !hasSource) {
          alert("Please select at least one product or sale item for this invoice.");
          return;
        }
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
            notes,
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

      {/* ── 1-CLICK DIRECT PRODUCT SELECTION CATALOG ── */}
      <div className="product-quick-select-section">
        <div className="pqs-header">
          <div className="pqs-title">
            <ShoppingBag size={16} />
            <span>Select Product / Service (Click to Add / Auto-Count)</span>
          </div>
          <span className="pqs-hint">Direct count · No manual typing</span>
        </div>

        <div className="pqs-grid">
          {productCatalog.map((prod) => {
            const isSelected = lines.some((l) => l.planId === prod.id || l.description === prod.title);
            const selectedItem = lines.find((l) => l.planId === prod.id || l.description === prod.title);
            const selectedQty = selectedItem ? selectedItem.quantity : 0;
            return (
              <button
                key={prod.id}
                type="button"
                className={"pqs-card" + (isSelected ? " selected" : "")}
                onClick={() => selectProduct(prod)}
                title={isSelected ? "Selected (Click card to remove, or use +/- to adjust)" : "Click to select 1 item"}
              >
                <div className="pqs-card-info">
                  <strong>{prod.title}</strong>
                  <span className="pqs-price">{money(prod.price)}</span>
                </div>
                <div className="pqs-card-badge">
                  {isSelected ? (
                    <span className="qty-badge" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        style={{ border: "none", background: "none", cursor: "pointer", padding: "0 5px", fontWeight: "bold", fontSize: "14px", color: "inherit" }}
                        onClick={(e) => stepProductQty(prod, -1, e)}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 600 }}>Qty: {selectedQty}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        style={{ border: "none", background: "none", cursor: "pointer", padding: "0 5px", fontWeight: "bold", fontSize: "14px", color: "inherit" }}
                        onClick={(e) => stepProductQty(prod, 1, e)}
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <span className="add-badge">
                      <Plus size={13} /> Select
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── UNBILLED FACTORY SALES & CHALLANS FOR THIS CUSTOMER ── */}
      {client && (salesRecords.length > 0 || lastInvoice) && (
        <div className="auto-gen-box">
          {salesRecords.length > 0 && (
            <div className="auto-gen-card sales">
              <div className="auto-gen-text">
                <span className="auto-badge">⚡ Factory Sales &amp; Challans</span>
                <strong>{salesRecords.length} unbilled delivery records found for this customer</strong>
                <p>Click any sale item below to add directly, or select all with 1 click.</p>
                <div className="sales-quick-pills">
                  {salesRecords.map((r) => {
                    const isAdded = lines.some((l) => l.saleId === r.id || l.description.includes(r.reference || r.day));
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={"sale-pill-btn" + (isAdded ? " added" : "")}
                        onClick={() => selectSaleRecord(r)}
                      >
                        {isAdded ? <Check size={12} /> : <Plus size={12} />}
                        {r.reference || r.category} ({money(r.amount)})
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                className="primary auto-action-btn"
                onClick={autoGenerateFromSales}
              >
                <Sparkles size={14} /> Select All ({salesRecords.length})
              </button>
            </div>
          )}

          {lastInvoice && (
            <div className="auto-gen-card copy">
              <div className="auto-gen-text">
                <span className="auto-badge-gray">📋 Repeat Previous</span>
                <strong>Copy from previous Invoice #{invoiceNumber(lastInvoice.sequence)}</strong>
                <p>Auto-fill line items, tax rate, discount &amp; terms from last invoice.</p>
              </div>
              <button
                type="button"
                className="secondary auto-action-btn"
                onClick={copyFromLastInvoice}
              >
                <Copy size={14} /> Copy Last Items
              </button>
            </div>
          )}
        </div>
      )}

      <InvoiceWorkshopPicker
        client={client}
        day={issued}
        choice={workshop}
        onChange={setWorkshop}
      />

      {/* ── LINE ITEMS LIST ── */}
      <div className="line-heading">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3>Selected Invoice Line Items ({lines.length})</h3>
        </div>
        <button
          type="button"
          className="text-btn"
          disabled={lines.length + (sub ? 1 : 0) >= 50}
          onClick={() => setLines([...lines, blankLine()])}
        >
          <Plus size={14} />
          + Custom item
        </button>
      </div>

      {sub && (
        <>
          <div className="sub-line">
            <span>{sub.planLabel}</span>
            <b>{money(sub.price)}</b>
          </div>
          <div
            className="form-intro"
            style={{
              background: "var(--gold-light)",
              border: "1px solid var(--gold)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 8,
              fontSize: "0.85rem",
              color: "var(--ink)",
            }}
          >
            ✦ Auto-populated from subscription — line items below are additional charges on top of recurring fee.
          </div>
        </>
      )}

      {lines.length === 0 && (
        <div style={{
          padding: "24px 16px",
          textAlign: "center",
          background: "var(--surface-2)",
          borderRadius: 8,
          border: "1px dashed var(--line)",
          margin: "12px 0",
          color: "var(--sub)",
        }}>
          <ShoppingBag size={24} style={{ margin: "0 auto 8px", color: "var(--gold)" }} />
          <p style={{ margin: 0, fontWeight: 550, color: "var(--ink)" }}>No products selected yet</p>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>Click any product card above to add it to this invoice instantly.</p>
        </div>
      )}

      {lines.map((l, i) => {
        const lineAmt = (Number(l.quantity) || 0) * (Number(l.price) || 0);
        return (
          <div className="line-editor" key={l.key}>
            <div className="line-type">
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
                Item #{i + 1}
              </span>
              <button
                aria-label={"Remove item " + (i + 1)}
                type="button"
                className="row-action"
                onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="line-fields">
              <Field name="Description">
                <input
                  value={l.description}
                  placeholder="Item name"
                  maxLength="200"
                  onChange={(e) => update(l.key, { description: e.target.value })}
                />
              </Field>
              <Field name="HSN/SAC">
                <input
                  value={l.hsnCode}
                  maxLength="8"
                  placeholder="9988"
                  onChange={(e) => update(l.key, { hsnCode: e.target.value })}
                />
              </Field>
              <Field name="Quantity">
                <div className="qty-stepper">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => {
                      const q = Math.max(1, Number(l.quantity || 1) - 1);
                      update(l.key, { quantity: String(q) });
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                  />
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => {
                      const q = Number(l.quantity || 1) + 1;
                      update(l.key, { quantity: String(q) });
                    }}
                  >
                    +
                  </button>
                </div>
              </Field>
              <Field name="Unit price (₹)">
                <input
                  type="number"
                  min="0"
                  max="20000000"
                  step="0.01"
                  value={l.price}
                  onChange={(e) => update(l.key, { price: e.target.value })}
                />
              </Field>
              <Field name="Amount">
                <div
                  style={{
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--ink)",
                    background: "var(--gold-light, #FDF8EC)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    borderRadius: 6,
                    minHeight: 36,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  ₹{lineAmt.toFixed(2)}
                </div>
              </Field>
            </div>
          </div>
        );
      })}

      <div className="form-grid">
        <Field name="Discount (%)">
          <div>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <div className="quick-pill-row">
              {[0, 2, 5, 10, 15].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={"quick-pill" + (Number(discount) === d ? " active" : "")}
                  onClick={() => setDiscount(String(d))}
                >
                  {d}%
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field name="Tax / GST (%)">
          <div>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
            <div className="quick-pill-row">
              {[0, 5, 12, 18, 28].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={"quick-pill" + (Number(tax) === t ? " active" : "")}
                  onClick={() => setTax(String(t))}
                >
                  {t}%
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field name="Notes &amp; Terms" wide>
          <div>
            <textarea
              name="notes"
              rows="2"
              maxLength="1000"
              value={notes}
              placeholder="Payment terms, delivery challan details, bank info..."
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="quick-pill-row notes">
              {[
                "Net 15 Days",
                "Payment on Delivery",
                "Cheque in favor of I Shree Enterprise",
                "Goods once sold will not be taken back",
              ].map((term) => (
                <button
                  key={term}
                  type="button"
                  className="quick-pill note-pill"
                  onClick={() =>
                    setNotes((prev) => (prev ? prev + " · " + term : term))
                  }
                >
                  + {term}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field name="Save as">
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="issued">Issue Now (Send to customer)</option>
            <option value="draft">Save as Draft (Don&apos;t send yet)</option>
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
          GST ({tax}%) <b>{money(totals.tax)}</b>
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
