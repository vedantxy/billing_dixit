import assert from "node:assert/strict";
import test from "node:test";
import {
  businessDay,
  emptyBook,
  invoiceDetails,
  invoiceTotals,
  nextCycle,
  summarize,
} from "../lib/billing.mjs";
import { BookChanges, mutate } from "../server/commands.mjs";

const today = "2026-11-15";
function fixture() {
  const tx = new BookChanges(emptyBook());
  const post = (resource, data) => mutate(tx, { method: "POST", resource, data, today });
  const patch = (resource, id, data) => mutate(tx, { method: "PATCH", resource, id, data, today });
  const customer = post("customers", { name: "Test Studio", email: "test@example.org" });
  const product = post("products", { name: "Design" });
  const plan = post("plans", {
    productId: product.id,
    name: "Team",
    price: 1200000,
    cadence: "yearly",
  });
  const bill = (more = {}) =>
    post("invoices", {
      customerId: customer.id,
      issuedOn: "2026-11-01",
      dueOn: today,
      lines: [{ description: "Setup", quantity: 1, unitPrice: 10000 }],
      ...more,
    });
  return { tx, post, patch, customer, product, plan, bill };
}
test("January 31 billing returns to the 31st after February", () => {
  assert.equal(nextCycle("2025-01-31", "monthly", 31), "2025-02-28");
  assert.equal(nextCycle("2025-02-28", "monthly", 31), "2025-03-31");
  assert.equal(nextCycle("2024-02-29", "yearly", 29), "2025-02-28");
});
test("India billing date rolls over at midnight in India", () => {
  assert.equal(businessDay(new Date("2026-11-14T18:29:59Z")), "2026-11-14");
  assert.equal(businessDay(new Date("2026-11-14T18:30:00Z")), today);
});
test("discount precedes tax and each monetary result rounds to a whole paise", () => {
  assert.deepEqual(invoiceTotals([{ quantity: 3, unitPrice: 999 }], 1000, 1800), {
    subtotal: 2997,
    discount: 300,
    tax: 485,
    total: 3182,
  });
});
test("plan and customer changes preserve the issued invoice", () => {
  const f = fixture();
  const sub = f.post("subscriptions", {
    customerId: f.customer.id,
    planId: f.plan.id,
    startDate: "2026-01-01",
  });
  const inv = f.bill({ subscriptionId: sub.id, lines: [] });
  f.patch("plans", f.plan.id, { price: 1600000 });
  f.patch("customers", f.customer.id, { name: "Renamed Studio" });
  assert.equal(invoiceDetails(f.tx.book, inv, today).total, 1200000);
  assert.equal(inv.billTo, "Test Studio");
  assert.equal(sub.price, 1200000);
});
test("partial, failed, pending and reversed payments update the ledger correctly", () => {
  const f = fixture(),
    inv = f.bill({ dueOn: "2026-11-14" });
  const pay = (status) =>
    f.post("payments", { invoiceId: inv.id, amount: 5000, status, method: "upi", paidOn: today });
  const partial = pay("successful");
  pay("failed");
  const pending = pay("pending");
  assert.equal(invoiceDetails(f.tx.book, inv, today).status, "overdue");
  assert.equal(summarize(f.tx.book, today).revenue, 5000);
  f.patch("payments", pending.id, { status: "successful" });
  assert.equal(invoiceDetails(f.tx.book, inv, today).status, "paid");
  assert.throws(() => pay("successful"), /exceeds/);
  f.patch("payments", partial.id, { status: "failed" });
  assert.equal(invoiceDetails(f.tx.book, inv, today).balance, 5000);
});
test("annual MRR excludes paused, cancelled and future subscriptions", () => {
  const f = fixture();
  const sub = f.post("subscriptions", {
    customerId: f.customer.id,
    planId: f.plan.id,
    startDate: "2026-01-01",
  });
  f.post("subscriptions", {
    customerId: f.customer.id,
    planId: f.plan.id,
    startDate: "2027-01-01",
  });
  assert.equal(summarize(f.tx.book, today).mrr, 100000);
  f.patch("subscriptions", sub.id, { action: "status", status: "paused" });
  assert.equal(summarize(f.tx.book, today).mrr, 0);
  f.patch("subscriptions", sub.id, { action: "status", status: "cancelled" });
  assert.throws(
    () => f.patch("subscriptions", sub.id, { action: "status", status: "active" }),
    /cancelled/,
  );
});
test("a repeated renewal for the same billing date cannot issue a second invoice", () => {
  const f = fixture();
  const sub = f.post("subscriptions", {
    customerId: f.customer.id,
    planId: f.plan.id,
    startDate: "2025-11-01",
  });
  const action = { action: "renew", expectedNextDate: sub.nextDate };
  f.patch("subscriptions", sub.id, action);
  assert.equal(f.tx.book.invoices.length, 1);
  assert.throws(() => f.patch("subscriptions", sub.id, action), /cycle has changed/);
});
test("drafts stay out of receivables and a due-today invoice is pending", () => {
  const f = fixture(),
    inv = f.bill({ stage: "draft" });
  assert.equal(summarize(f.tx.book, today).outstanding, 0);
  assert.throws(
    () =>
      f.post("payments", {
        invoiceId: inv.id,
        amount: 100,
        status: "successful",
        method: "upi",
        paidOn: today,
      }),
    /Issue the draft/,
  );
  f.patch("invoices", inv.id, { action: "issue" });
  assert.equal(invoiceDetails(f.tx.book, inv, today).status, "pending");
});
test("validation rejects invalid dates, rates, disabled products and duplicate emails", () => {
  const f = fixture();
  assert.throws(() => f.bill({ issuedOn: "2026-02-30" }), /valid date/);
  assert.throws(() => f.bill({ taxBps: 10001 }), /allowed range/);
  assert.throws(
    () => f.post("customers", { name: "Other", email: "TEST@EXAMPLE.ORG" }),
    /already uses/,
  );
  f.patch("products", f.product.id, { enabled: false });
  assert.throws(
    () =>
      f.post("subscriptions", { customerId: f.customer.id, planId: f.plan.id, startDate: today }),
    /enabled/,
  );
});
test("invoice lines deduplicate duplicate entries and display each item once", () => {
  const f = fixture();
  const inv = f.bill({
    lines: [
      { description: "Full Saree Embroidery", quantity: 1, unitPrice: 25000 },
      { description: "Full Saree Embroidery", quantity: 1, unitPrice: 25000 },
      { description: "Jobwork · Challan #101 · 100 pcs", quantity: 100, unitPrice: 2500 },
      { description: "Challan #101 · Factory jobwork", quantity: 1, unitPrice: 250000 },
    ],
  });
  const details = invoiceDetails(f.tx.book, inv, today);
  assert.equal(details.lines.length, 2);
  assert.equal(details.lines[0].description, "Full Saree Embroidery");
  assert.equal(details.lines[1].description, "Jobwork · Challan #101 · 100 pcs");
});
