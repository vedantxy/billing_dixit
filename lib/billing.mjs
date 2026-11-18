export const tables = [
  "customers",
  "products",
  "plans",
  "subscriptions",
  "events",
  "invoices",
  "lines",
  "payments",
];
export const cadences = { monthly: "Monthly", yearly: "Yearly", once: "One-time" };
export const statuses = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
  past_due: "Past due",
  draft: "Draft",
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
  successful: "Successful",
  failed: "Failed",
  enabled: "Enabled",
  disabled: "Disabled",
  archived: "Archived",
};
export const methods = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  other: "Other",
};
export const emptyBook = () => Object.fromEntries(tables.map((table) => [table, []]));
const dayMs = 86400000;
const formatRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
export const money = (paise) => formatRupees.format(paise / 100);
export const isoDay = (date) => new Date(date).toISOString().slice(0, 10);
export const businessDay = (now = new Date()) =>
  new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
export const plusDays = (date, days) =>
  isoDay(new Date(date + "T00:00:00Z").getTime() + days * dayMs);
export const daysBetween = (a, b) =>
  Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / dayMs);
export const niceDate = (date, full = false) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(full ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(date));
export const invoiceNumber = (sequence) => "INV-" + String(sequence).padStart(4, "0");
export const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export function nextCycle(date, cadence, anchor = Number(date.slice(8))) {
  const target = new Date(date + "T00:00:00Z");
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + (cadence === "yearly" ? 12 : 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchor, last));
  return isoDay(target);
}

export function invoiceTotals(lines, discountBps = 0, taxBps = 0) {
  const subtotal = lines.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const discount = Math.round((subtotal * discountBps) / 10000);
  const tax = Math.round(((subtotal - discount) * taxBps) / 10000);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

export function invoiceDetails(book, invoice, today = businessDay()) {
  const lines = book.lines
    .filter((line) => line.invoiceId === invoice.id)
    .sort((a, b) => a.position - b.position);
  const payments = book.payments.filter((payment) => payment.invoiceId === invoice.id);
  const totals = invoiceTotals(lines, invoice.discountBps, invoice.taxBps);
  const collected = payments
    .filter((p) => p.status === "successful")
    .reduce((sum, p) => sum + p.amount, 0);
  const balance = totals.total - collected;
  let status = "pending";
  if (invoice.stage === "draft") status = "draft";
  else if (balance === 0) status = "paid";
  else if (invoice.dueOn < today) status = "overdue";
  return { ...invoice, ...totals, lines, payments, collected, balance, status };
}

export function summarize(book, today = businessDay(), monthCount = 6) {
  const current = new Date(today + "T00:00:00Z");
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + index - monthCount + 1, 1),
    );
    return {
      key: isoDay(date).slice(0, 7),
      label: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      collected: 0,
      billed: 0,
    };
  });
  const byMonth = new Map(months.map((month) => [month.key, month]));
  const invoices = book.invoices
    .map((invoice) => invoiceDetails(book, invoice, today))
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.sequence - a.sequence);
  const open = invoices.filter((invoice) => ["pending", "overdue"].includes(invoice.status));
  let revenue = 0;
  for (const p of book.payments) {
    if (p.status !== "successful") continue;
    revenue += p.amount;
    const month = byMonth.get(p.paidOn.slice(0, 7));
    if (month) month.collected += p.amount;
  }
  for (const inv of invoices) {
    const month = byMonth.get(inv.issuedOn.slice(0, 7));
    if (month && inv.stage === "issued") month.billed += inv.total;
  }
  const active = book.subscriptions.filter(
    (sub) => sub.status === "active" && sub.startDate <= today,
  );
  const renewals = book.subscriptions
    .filter(
      (sub) =>
        sub.status === "active" && sub.nextDate >= today && sub.nextDate <= plusDays(today, 30),
    )
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.id.localeCompare(b.id));
  return {
    invoices,
    months,
    revenue,
    active: active.length,
    mrr: Math.round(
      active.reduce((sum, s) => sum + s.price / (s.cadence === "yearly" ? 12 : 1), 0),
    ),
    renewals,
    open,
    overdue: open.filter((i) => i.status === "overdue"),
    outstanding: open.reduce((sum, i) => sum + i.balance, 0),
  };
}
