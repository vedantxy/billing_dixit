import {
  cadences,
  methods,
  invoiceTotals,
  invoiceDetails,
  invoiceNumber,
  nextCycle,
  plusDays,
} from "../lib/billing.mjs";
import {
  BillingError,
  clean,
  choose,
  dateValue,
  ensure,
  flag,
  integer,
} from "../lib/validation.mjs";

export class BookChanges {
  constructor(book) {
    this.book = book;
    this.operations = [];
  }
  get(table, id) {
    const row = this.book[table].find((item) => item.id === id);
    ensure(row, "This record could not be found.", 404);
    return row;
  }
  add(table, data) {
    const row = { id: crypto.randomUUID(), ...data };
    this.book[table].push(row);
    this.operations.push({ type: "create", table, row });
    return row;
  }
  edit(table, id, changes) {
    const row = this.get(table, id);
    Object.assign(row, changes);
    this.operations.push({ type: "update", table, id, changes });
    return row;
  }
  remove(table, id) {
    this.get(table, id);
    this.book[table] = this.book[table].filter((row) => row.id !== id);
    this.operations.push({ type: "delete", table, id });
  }
}
function customerInput(tx, data, id) {
  const email = clean(data.email, "Email", 254).toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address.");
  ensure(
    !tx.book.customers.some((c) => c.email === email && c.id !== id),
    "A customer already uses this email.",
    409,
  );
  return {
    name: clean(data.name, "Customer name"),
    email,
    phone: clean(data.phone ?? "", "Phone", 40, false),
    address: clean(data.address ?? "", "Billing address", 500, false),
  };
}
function customers(tx, { method, id, data, today }) {
  if (method === "POST")
    return tx.add("customers", { ...customerInput(tx, data), archived: false, createdOn: today });
  const customer = tx.get("customers", id);
  if (method === "PATCH") {
    if (data.action === "restore") return tx.edit("customers", id, { archived: false });
    return tx.edit("customers", id, customerInput(tx, { ...customer, ...data }, id));
  }
  ensure(
    !tx.book.subscriptions.some((s) => s.customerId === id && s.status !== "cancelled"),
    "Cancel this customer’s subscriptions before removing them.",
    409,
  );
  if (
    tx.book.invoices.some((i) => i.customerId === id) ||
    tx.book.subscriptions.some((s) => s.customerId === id)
  )
    return tx.edit("customers", id, { archived: true });
  tx.remove("customers", id);
  return { id, deleted: true };
}
function products(tx, { method, id, data }) {
  const row =
    method === "PATCH"
      ? { ...tx.get("products", id), ...data }
      : { enabled: true, description: "", ...data };
  const values = {
    name: clean(row.name, "Product name"),
    description: clean(row.description, "Description", 500, false),
    enabled: flag(row.enabled),
  };
  return method === "POST" ? tx.add("products", values) : tx.edit("products", id, values);
}
function plans(tx, { method, id, data }) {
  const current = method === "PATCH" ? tx.get("plans", id) : null;
  const row = { enabled: true, ...current, ...data };
  const product = tx.get("products", row.productId);
  if (current)
    ensure(row.productId === current.productId, "A plan must stay with its original product.");
  else ensure(product.enabled, "Enable this product before adding a plan.");
  const values = {
    productId: product.id,
    name: clean(row.name, "Plan name"),
    cadence: choose(row.cadence, Object.keys(cadences), "billing interval"),
    price: integer(row.price, "Price", 1),
    enabled: flag(row.enabled),
  };
  return current ? tx.edit("plans", id, values) : tx.add("plans", values);
}
function availablePlan(tx, id, recurring = false) {
  const plan = tx.get("plans", id);
  const product = tx.get("products", plan.productId);
  ensure(plan.enabled && product.enabled, "Choose an enabled product and pricing plan.");
  ensure(
    !recurring || plan.cadence !== "once",
    "Choose a monthly or yearly plan for a subscription.",
  );
  return { plan, label: product.name + " · " + plan.name };
}
function profile(tx, id) {
  const customer = tx.get("customers", id);
  ensure(!customer.archived, "Restore this customer before creating new billing records.");
  return customer;
}
function addEvent(tx, subscriptionId, message) {
  tx.add("events", { subscriptionId, at: new Date().toISOString(), message });
}
function subscriptions(tx, { method, id, data, today }) {
  if (method === "POST") {
    const customer = profile(tx, data.customerId);
    const { plan, label } = availablePlan(tx, data.planId, true);
    const startDate = dateValue(data.startDate, "Start date");
    const nextDate = dateValue(
      data.nextDate || nextCycle(startDate, plan.cadence),
      "Next billing date",
    );
    ensure(nextDate > startDate, "Next billing must be after the start date.");
    const naturalNext = nextCycle(startDate, plan.cadence);
    const anchorDay = Number((naturalNext === nextDate ? startDate : nextDate).slice(8));
    const row = tx.add("subscriptions", {
      customerId: customer.id,
      planId: plan.id,
      planLabel: label,
      price: plan.price,
      cadence: plan.cadence,
      status: "active",
      startDate,
      nextDate,
      anchorDay,
    });
    addEvent(tx, row.id, "Subscription started on " + label + ".");
    return row;
  }
  const sub = tx.get("subscriptions", id);
  ensure(sub.status !== "cancelled", "This subscription has been cancelled.", 409);
  if (data.action === "change_plan") {
    const { plan, label } = availablePlan(tx, data.planId, true);
    ensure(
      plan.id !== sub.planId || plan.price !== sub.price || plan.cadence !== sub.cadence,
      "Choose a different plan.",
    );
    const previous = sub.planLabel;
    const row = tx.edit("subscriptions", id, {
      planId: plan.id,
      planLabel: label,
      price: plan.price,
      cadence: plan.cadence,
    });
    addEvent(
      tx,
      id,
      "Plan changed from " +
        previous +
        " to " +
        label +
        ". New price applies at the next billing date.",
    );
    return row;
  }
  if (data.action === "renew") {
    ensure(
      sub.status === "active" || sub.status === "past_due",
      "Resume the subscription before renewing.",
      409,
    );
    ensure(
      data.expectedNextDate === sub.nextDate,
      "This billing cycle has changed. Refresh and try again.",
      409,
    );
    ensure(sub.nextDate <= today, "This renewal is available on " + sub.nextDate + ".", 409);
    const cycle = sub.nextDate;
    const invoice = saveInvoice(
      tx,
      {
        customerId: sub.customerId,
        subscriptionId: id,
        lines: [],
        issuedOn: today,
        dueOn: plusDays(today, 7),
        stage: "issued",
      },
      today,
    );
    tx.edit("subscriptions", id, {
      nextDate: nextCycle(cycle, sub.cadence, sub.anchorDay),
      status: "active",
    });
    addEvent(
      tx,
      id,
      "Renewal for " + cycle + " billed on " + invoiceNumber(invoice.sequence) + ".",
    );
    return invoice;
  }
  ensure(data.action === "status", "Choose a subscription action.");
  const status = choose(
    data.status,
    ["active", "paused", "cancelled", "past_due"],
    "subscription status",
  );
  if (sub.status !== status) {
    tx.edit("subscriptions", id, { status });
    addEvent(tx, id, "Status changed to " + status.replace("_", " ") + ".");
  }
  return sub;
}
function normalizeLine(tx, line) {
  ensure(line && typeof line === "object", "Enter a valid invoice line.");
  const quantity = integer(line.quantity, "Quantity", 1, 10000);
  if (line.planId) {
    const { plan, label } = availablePlan(tx, line.planId);
    ensure(plan.cadence === "once", "Use a one-time pricing plan or a custom line.");
    return { planId: plan.id, description: label, quantity, unitPrice: plan.price };
  }
  return {
    planId: null,
    description: clean(line.description, "Item description", 200),
    quantity,
    unitPrice: integer(line.unitPrice, "Unit price"),
  };
}
function saveInvoice(tx, data, today) {
  const customer = profile(tx, data.customerId);
  const issuedOn = dateValue(data.issuedOn, "Invoice date");
  const dueOn = dateValue(data.dueOn, "Due date");
  ensure(dueOn >= issuedOn, "Due date must be on or after the invoice date.");
  ensure(issuedOn <= today, "Invoice date cannot be in the future.");
  ensure(Array.isArray(data.lines) && data.lines.length <= 50, "Use up to 50 line items.");
  const lines = data.lines.map((line) => normalizeLine(tx, line));
  if (data.subscriptionId) {
    const sub = tx.get("subscriptions", data.subscriptionId);
    ensure(
      sub.customerId === customer.id && ["active", "past_due"].includes(sub.status),
      "Choose an active or past-due subscription for this customer.",
    );
    ensure(
      sub.startDate <= issuedOn,
      "Invoice date must be on or after the subscription start date.",
    );
    lines.unshift({
      planId: sub.planId,
      description: sub.planLabel,
      quantity: 1,
      unitPrice: sub.price,
    });
  }
  ensure(lines.length > 0 && lines.length <= 50, "An invoice needs between 1 and 50 line items.");
  const discountBps = integer(data.discountBps ?? 0, "Discount", 0, 10000);
  const taxBps = integer(data.taxBps ?? 0, "Tax rate", 0, 10000);
  const totals = invoiceTotals(lines, discountBps, taxBps);
  integer(totals.subtotal, "Invoice subtotal");
  integer(totals.total, "Invoice total");
  const sequence = tx.book.invoices.reduce((max, inv) => Math.max(max, inv.sequence), 1000) + 1;
  const invoice = tx.add("invoices", {
    sequence,
    customerId: customer.id,
    subscriptionId: data.subscriptionId || null,
    billTo: customer.name,
    billEmail: customer.email,
    billAddress: customer.address,
    stage: choose(data.stage ?? "issued", ["draft", "issued"], "invoice stage"),
    issuedOn,
    dueOn,
    discountBps,
    taxBps,
    notes: clean(data.notes ?? "", "Notes", 1000, false),
  });
  lines.forEach((line, position) => tx.add("lines", { invoiceId: invoice.id, ...line, position }));
  return invoice;
}
function invoices(tx, { method, id, data, today }) {
  if (method === "POST") return saveInvoice(tx, data, today);
  const invoice = tx.get("invoices", id);
  ensure(data.action === "issue" && invoice.stage === "draft", "Only a draft can be issued.", 409);
  return tx.edit("invoices", id, { stage: "issued" });
}
function payments(tx, { method, id, data, today }) {
  const old = method === "PATCH" ? tx.get("payments", id) : null;
  const input = old ? { ...old, status: data.status } : data;
  const invoice = tx.get("invoices", input.invoiceId);
  ensure(invoice.stage === "issued", "Issue the draft before recording a payment.", 409);
  const amount = integer(input.amount, "Payment amount", 1);
  const paidOn = dateValue(input.paidOn, "Payment date");
  ensure(
    paidOn >= invoice.issuedOn && paidOn <= today,
    "Payment date must be between the invoice date and today.",
  );
  const status = choose(input.status, ["successful", "pending", "failed"], "payment status");
  const details = invoiceDetails(tx.book, invoice, today);
  const available = details.balance + (old?.status === "successful" ? old.amount : 0);
  if (!old || status === "successful")
    ensure(amount <= available, "Payment exceeds the remaining invoice balance.", 409);
  const values = {
    invoiceId: invoice.id,
    amount,
    paidOn,
    status,
    method: choose(input.method, Object.keys(methods), "payment method"),
  };
  return old ? tx.edit("payments", id, { status }) : tx.add("payments", values);
}
const handlers = { customers, products, plans, subscriptions, invoices, payments };
export function mutate(tx, command) {
  ensure(Object.hasOwn(handlers, command.resource), "Unknown resource.", 404);
  const { method, id, resource, data } = command;
  ensure(data && typeof data === "object" && !Array.isArray(data), "Send a JSON object.");
  const allowed =
    (method === "POST" && !id) ||
    (method === "PATCH" && id) ||
    (method === "DELETE" && id && resource === "customers");
  if (!allowed) throw new BillingError("Method is not supported for this resource.", 405);
  return handlers[resource](tx, command);
}
