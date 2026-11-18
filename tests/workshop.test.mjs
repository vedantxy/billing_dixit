import test from "node:test";
import assert from "node:assert/strict";
import { monthlyBook, reportTables, sections } from "../lib/workshop.mjs";
import { reportCsv } from "../lib/workshop-export.mjs";
import {
  materialDetail,
  monthRange,
  saleDetail,
  selectedSections,
} from "../server/workshop-store.mjs";
const w = {
  id: "w",
  name: "Sample Worker",
  job: "Operator",
  machine: "M1",
  rate: 3000000,
};
const base = {
  month: "2025-03",
  workers: [w],
  customers: [],
  profile: { name: "Test" },
  opening: { cash: 3200, bank: 1800 },
  records: [],
  attendance: [],
  invoices: [],
  receipts: [],
};
const row = (id, kind, amount, extra = {}) => ({
  id,
  kind,
  amount,
  category: kind,
  workerId: "w",
  day: "2025-03-01",
  cash: 0,
  bank: 0,
  detail: {},
  memo: "Approved correction",
  ...extra,
});
test("weighted attendance, rate snapshots, adjustments and net salary agree with the salary sheet", () => {
  const attendance = ["P", "A", "H", "E"].map((status, i) => ({
    workerId: "w",
    day: "2025-03-0" + (i + 1),
    status,
    rate: 3000000,
    extraHalfDays: i === 0 ? 1 : 0,
  }));
  const records = [
    row("1", "advance", 50000, { cash: 30000, bank: 20000 }),
    row("2", "payout", 70000, { bank: 70000 }),
    row("3", "night", 10000, { detail: { days: 1 } }),
    row("4", "bonus", 12300),
    row("5", "adjustment", -2300),
    row("6", "expense", 15000, { cash: 15000, category: "Tea bill" }),
  ];
  const book = monthlyBook({
    ...base,
    workers: [{ ...w, rate: 6000000 }],
    attendance,
    records,
  });
  const pay = book.payroll[0];
  assert.equal(pay.days, 3);
  assert.equal(pay.extra, 0.5);
  assert.equal(pay.base, 350000);
  assert.equal(pay.regular, 360000);
  assert.equal(pay.net, 320000);
  assert.equal(pay.due, 250000);
  assert.equal(book.totals.costs, 385000);
  assert.equal(book.totals.debit, 135000);
  const tables = reportTables(book, Object.keys(sections));
  assert.deepEqual(tables[0].headers, [
    "Name",
    "Hajari",
    "Pagar",
    "Upad",
    "Total",
  ]);
  assert.ok(
    tables.some((t) => t.rows.some((r) => r.includes("Sheet grand total"))),
  );
});
test("material fractional packs and counted quantities are auditable", () => {
  assert.deepEqual(
    materialDetail({ packs: 0.5, rate: 140 }, "Paper Sheet", "").detail,
    { packs: 0.5, factor: 1000, units: 500, rate: 140 },
  );
  assert.throws(
    () => materialDetail({ packs: 1.2, units: 47, rate: 200 }, "Syroski", ""),
    /Explain/,
  );
  assert.equal(
    materialDetail({ packs: 1.2, units: 47, rate: 200 }, "Syroski", "One short")
      .amount,
    9400,
  );
  assert.throws(
    () => materialDetail({ packs: 1.2345, rate: 1 }, "Syroski", ""),
    /three decimal/,
  );
});
test("party challans use accepted quantities and keep different customers separate", () => {
  const sale = saleDetail({
    pieces: 100,
    short: 4,
    rate: 2500,
    challan: "C-7",
  });
  assert.equal(sale.amount, 240000);
  const sales = ["A", "B"].map((p) =>
    row(p, "sale", sale.amount, {
      party: p,
      customerId: p,
      detail: sale.detail,
    }),
  );
  const book = monthlyBook({
    ...base,
    records: sales,
    invoices: [
      {
        billTo: "A",
        discountBps: 1000,
        lines: [{ quantity: 96, unitPrice: 2500 }],
        workshopRecords: [{ kind: "sale", amount: 240000 }],
      },
    ],
  });
  assert.equal(book.records[0].challanTotal, 240000);
  assert.equal(book.totals.sales, 456000);
});
test("credit purchases accrue on the bill date and settlements only move cash", () => {
  const book = monthlyBook({
    ...base,
    records: [
      row("p", "expense", 12000, { category: "MAMA", cash: 2000 }),
      row("s", "settlement", 3000, { bank: 3000 }),
      row("c", "cashbook", 1000, { category: "Credit", cash: 1000 }),
      row("v", "expense", 8700, { voidedAt: "2025-03-02", bank: 8700 }),
    ],
    receipts: [
      {
        id: "r",
        invoice: { billTo: "A", sequence: 1001 },
        paidOn: "2025-03-03",
        amount: 5000,
        method: "upi",
      },
    ],
  });
  assert.equal(book.totals.costs, 12000);
  assert.equal(book.totals.closing, 6000);
  assert.equal(book.totals.cash, 2200);
  assert.equal(book.totals.bank, 3800);
});
test("report selection and spreadsheet exports reject unexpected fields and neutralise formulas", () => {
  assert.deepEqual(selectedSections(["sales", "sales"]), ["sales"]);
  assert.throws(() => selectedSections(["foo"]));
  assert.throws(() => monthRange("2025-13"));
  const csv = reportCsv([
    {
      title: "Rojmel",
      headers: ["Name"],
      rows: [["  =SUM(1,2)"], ['A "quoted" firm']],
    },
  ]);
  assert.ok(csv.includes("'  =SUM"));
  assert.ok(csv.includes('A ""quoted"" firm'));
});
