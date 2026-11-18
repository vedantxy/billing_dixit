import { money } from "./billing.mjs";

export const marks = {
  P: "Present",
  H: "Half day",
  E: "Dodh hajri",
  A: "Absent",
};
export const halfUnits = { P: 2, H: 1, E: 3, A: 0 };
export const expenses = [
  "Parchuran Kharch",
  "MAMA",
  "Machinery Kharch",
  "Makan Rent",
  "Light Bill",
  "Fusing",
  "Alter",
  "Petrol",
  "Tea bill",
  "Safsafai",
  "Other",
];
export const materials = {
  Syroski: { factor: 40, pack: "Peti", unit: "packets" },
  "Paper Sheet": { factor: 1000, pack: "Boxes", unit: "sheets" },
};
export const sections = {
  payroll: "Salary sheet",
  attendance: "Attendance",
  advances: "Advances & payouts",
  expenses: "Expense register",
  materials: "Material purchases",
  sales: "Party sales & challans",
  cashbook: "Rojmel",
  summary: "Monthly result",
};
export const payrollKinds = [
  "advance",
  "payout",
  "night",
  "bonus",
  "adjustment",
];
export const labels = {
  expense: "Expense",
  material: "Material purchase",
  sale: "Job sale",
  advance: "Salary advance",
  payout: "Salary payout",
  night: "Night salary",
  bonus: "Bonus",
  adjustment: "Salary adjustment",
  settlement: "Supplier settlement",
  cashbook: "Rojmel entry",
};
export const dateString = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
export const monthTitle = (month) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T00:00:00Z"));
export const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
export const flowSign = (kind, category) =>
  kind === "cashbook"
    ? category === "Credit"
      ? 1
      : -1
    : ["expense", "material", "advance", "payout", "settlement"].includes(kind)
      ? -1
      : 0;

export function monthlyBook({
  month,
  workers,
  records,
  attendance,
  invoices,
  receipts,
  opening,
  customers,
  profile,
}) {
  const byWorker = new Map(
    workers.map((w) => [
      w.id,
      {
        ...w,
        P: 0,
        H: 0,
        A: 0,
        E: 0,
        days: 0,
        extra: 0,
        weighted: 0,
        bonus: 0,
        adjustment: 0,
        night: 0,
        advance: 0,
        payout: 0,
        notes: [],
        activeMonth: false,
      },
    ]),
  );
  for (const mark of attendance) {
    const w = byWorker.get(mark.workerId);
    const half = halfUnits[mark.status];
    w[mark.status]++;
    w.days += half / 2;
    w.extra += mark.extraHalfDays / 2;
    w.weighted += mark.rate * (half + mark.extraHalfDays);
    w.activeMonth = true;
  }
  const active = records.filter((r) => !r.voidedAt);
  for (const r of active.filter((r) => payrollKinds.includes(r.kind))) {
    const w = byWorker.get(r.workerId);
    w[r.kind] += r.amount;
    w.activeMonth = true;
    if (r.kind === "adjustment" || r.kind === "bonus")
      w.notes.push(r.memo + " (" + money(r.amount) + ")");
  }
  const payroll = [...byWorker.values()]
    .filter((w) => w.activeMonth)
    .map((w) => {
      const base = Math.round(w.weighted / 60);
      const regular = base + w.bonus + w.adjustment;
      return {
        ...w,
        base,
        regular,
        gross: regular + w.night,
        net: regular + w.night - w.advance,
        due: regular + w.night - w.advance - w.payout,
      };
    });
  const costs = {};
  const addCost = (name, value) => {
    costs[name] = (costs[name] || 0) + value;
  };
  for (const r of active)
    if (r.kind === "expense" || r.kind === "material")
      addCost(r.category, r.amount);
  addCost("Karigar wages", sum(payroll, "regular"));
  addCost("Night salary", sum(payroll, "night"));
  const totalCosts = Object.values(costs).reduce((a, b) => a + b, 0);
  const sales = active.filter((r) => r.kind === "sale");
  const parties = Object.create(null);
  const addSale = (name, value) => {
    parties[name] = (parties[name] || 0) + value;
  };
  for (const r of sales) addSale(r.party, r.amount);
  for (const inv of invoices) {
    const subtotal = inv.lines.reduce(
      (a, l) => a + l.quantity * l.unitPrice,
      0,
    );
    const included = sum(
      inv.workshopRecords.filter((r) => r.kind === "sale"),
      "amount",
    );
    addSale(
      inv.billTo,
      subtotal - Math.round((subtotal * inv.discountBps) / 10000) - included,
    );
  }
  const totalSales = Object.values(parties).reduce((a, b) => a + b, 0);
  const flows = active
    .filter((r) => flowSign(r.kind, r.category) && (r.cash || r.bank))
    .map((r) => ({
      id: r.id,
      day: r.day,
      order: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      detail: [r.party, r.memo || r.category].filter(Boolean).join(" · "),
      credit: flowSign(r.kind, r.category) > 0 ? r.cash + r.bank : 0,
      debit: flowSign(r.kind, r.category) < 0 ? r.cash + r.bank : 0,
      cash: r.cash * flowSign(r.kind, r.category),
      bank: r.bank * flowSign(r.kind, r.category),
      source: labels[r.kind],
    }));
  for (const p of receipts)
    flows.push({
      id: p.id,
      day: dateString(p.paidOn),
      detail: p.invoice.billTo + " · INV-" + p.invoice.sequence,
      credit: p.amount,
      debit: 0,
      cash: p.method === "cash" ? p.amount : 0,
      bank: p.method === "cash" ? 0 : p.amount,
      source: "Invoice receipt",
    });
  let balance = opening.cash + opening.bank;
  const cashbook = flows
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.order || "").localeCompare(b.order || "") ||
        a.id.localeCompare(b.id),
    )
    .map((row) => ({ ...row, balance: (balance += row.credit - row.debit) }));
  const challans = new Map();
  for (const r of sales) {
    const key = r.customerId + "/" + r.detail.challan;
    challans.set(key, (challans.get(key) || 0) + r.amount);
  }
  const ledger = records.map((r) => ({
    ...r,
    challanTotal:
      r.kind === "sale"
        ? challans.get(r.customerId + "/" + r.detail.challan) || 0
        : 0,
  }));
  return {
    month,
    workers,
    customers,
    profile,
    records: ledger,
    attendance,
    payroll,
    cashbook,
    costs,
    parties,
    opening,
    totals: {
      sales: totalSales,
      costs: totalCosts,
      profit: totalSales - totalCosts,
      payroll: sum(payroll, "gross"),
      advances: sum(payroll, "advance"),
      payrollDue: sum(payroll, "due"),
      credit: sum(cashbook, "credit"),
      debit: sum(cashbook, "debit"),
      closing: balance,
      cash: opening.cash + sum(cashbook, "cash"),
      bank: opening.bank + sum(cashbook, "bank"),
    },
  };
}

// These tables are shared by the screen, CSV files and immutable invoice appendices.
export function reportTables(book, selected) {
  const { payroll, month, totals, workers } = book;
  const rows = book.records.filter((r) => !r.voidedAt);
  const worker = (id) => workers.find((w) => w.id === id)?.name || "—";
  const amount = (value) => money(value || 0);
  const table = (key, title, headers, rows) => ({
    key,
    title,
    headers,
    rows: rows.map((row) => row.map((v) => String(v ?? "—"))),
  });
  const result = [];
  for (const key of selected) {
    if (key === "payroll") {
      result.push(
        table(
          key,
          "Pagar · salary sheet",
          ["Name", "Hajari", "Pagar", "Upad", "Total"],
          payroll.map((w) => [
            w.name,
            w.days + w.extra,
            amount(w.regular),
            amount(w.advance),
            amount(w.regular - w.advance),
          ]),
        ),
      );
      result.push(
        table(
          key,
          "Night salary",
          ["Name", "Night days", "Particulars", "Total"],
          rows
            .filter((r) => r.kind === "night")
            .map((r) => [
              worker(r.workerId),
              r.detail.days,
              r.memo,
              amount(r.amount),
            ]),
        ),
      );
      for (const name of ["Fusing", "Tea bill", "Safsafai"])
        result.push(
          table(
            key,
            name,
            ["Date", "Particulars", "Total"],
            rows
              .filter((r) => r.kind === "expense" && r.category === name)
              .map((r) => [r.day, r.memo, amount(r.amount)]),
          ),
        );
      const extras = rows.filter(
        (r) =>
          r.kind === "expense" &&
          ["Fusing", "Tea bill", "Safsafai"].includes(r.category),
      );
      result.push(
        table(
          key,
          "Salary sheet reconciliation",
          ["Item", "Amount"],
          [
            [
              "Day salary after advances",
              amount(sum(payroll, "regular") - sum(payroll, "advance")),
            ],
            ["Night salary", amount(sum(payroll, "night"))],
            ["Fusing, tea and cleaning", amount(sum(extras, "amount"))],
            [
              "Sheet grand total",
              amount(sum(payroll, "net") + sum(extras, "amount")),
            ],
            ["Salary payouts already made", amount(sum(payroll, "payout"))],
            ["Payroll still due (including night)", amount(totals.payrollDue)],
          ],
        ),
      );
      result.push(
        table(
          key,
          "Pay calculation",
          [
            "Worker / role / machine",
            "Hajari + extra days",
            "Basic / bonus",
            "Adjustment / reason",
            "Gross / due",
          ],
          payroll.map((w) => [
            w.name + " · " + w.job + " · " + (w.machine || "—"),
            w.days + " + " + w.extra,
            amount(w.base) + " / " + amount(w.bonus),
            amount(w.adjustment) + " " + w.notes.join(", "),
            amount(w.gross) + " / " + amount(w.due),
          ]),
        ),
      );
    }
    if (key === "attendance")
      result.push(
        table(
          key,
          "Attendance · " + month,
          [
            "Date / day",
            "Karigar",
            "Work / machine",
            "Mark",
            "Extra machine days",
            "Monthly rate",
          ],
          book.attendance.map((a) => {
            const w = workers.find((w) => w.id === a.workerId);
            return [
              a.day +
                " " +
                new Intl.DateTimeFormat("en-IN", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(a.day + "T00:00:00Z")),
              w.name,
              w.job + " / " + (a.machine || w.machine || "—"),
              marks[a.status],
              a.extraHalfDays / 2,
              amount(a.rate),
            ];
          }),
        ),
      );
    if (key === "attendance")
      result.push(
        table(
          key,
          "Attendance totals",
          [
            "Karigar",
            "Present",
            "Half",
            "Absent",
            "Dodh",
            "Extra days",
            "Payable days",
          ],
          payroll.map((w) => [
            w.name,
            w.P,
            w.H,
            w.A,
            w.E,
            w.extra,
            w.days + w.extra,
          ]),
        ),
      );
    if (key === "advances")
      result.push(
        table(
          key,
          "Karigar upad & payouts",
          ["Date", "Worker", "Firm / details", "Type", "Cash", "Bank"],
          rows
            .filter((r) => ["advance", "payout"].includes(r.kind))
            .map((r) => [
              r.day,
              worker(r.workerId),
              [r.party, r.memo].filter(Boolean).join(" · "),
              labels[r.kind],
              amount(r.cash),
              amount(r.bank),
            ]),
        ),
        table(
          key,
          "Advances by worker",
          ["Karigar", "Cash", "Bank", "Total"],
          payroll
            .filter((w) => w.advance)
            .map((w) => {
              const list = rows.filter(
                (r) => r.workerId === w.id && r.kind === "advance",
              );
              return [
                w.name,
                amount(sum(list, "cash")),
                amount(sum(list, "bank")),
                amount(w.advance),
              ];
            }),
        ),
      );
    if (key === "expenses")
      result.push(
        table(
          key,
          "Expense register",
          [
            "Date / bill",
            "Category / party",
            "Vigat",
            "Cash",
            "Bank",
            "Baki at month end",
            "Total",
          ],
          rows
            .filter((r) => r.kind === "expense")
            .map((r) => [
              r.day + " " + r.reference,
              r.category + " " + r.party,
              r.memo,
              amount(r.cash),
              amount(r.bank),
              amount(r.outstanding),
              amount(r.amount),
            ]),
        ),
      );
    if (key === "expenses")
      result.push(
        table(
          key,
          "Supplier settlements",
          ["Date", "Supplier", "Category", "Bill / reference", "Cash", "Bank"],
          rows
            .filter((r) => r.kind === "settlement")
            .map((r) => [
              r.day,
              r.party,
              r.category,
              r.reference || r.memo,
              amount(r.cash),
              amount(r.bank),
            ]),
        ),
      );
    if (key === "materials")
      result.push(
        table(
          key,
          "Material purchases",
          [
            "Date / bill",
            "Material / party",
            "Peti / box",
            "Packets / sheets",
            "Bhav",
            "Total / baki",
          ],
          rows
            .filter((r) => r.kind === "material")
            .map((r) => [
              r.day + " " + r.reference,
              r.category + " · " + r.party + " " + r.memo,
              r.detail.packs,
              r.detail.units,
              amount(r.detail.rate),
              amount(r.amount) + " / " + amount(r.outstanding),
            ]),
        ),
      );
    if (key === "sales")
      result.push(
        table(
          key,
          "Jobwork sales",
          [
            "Date / party",
            "P.Ch. / P.D. / D.No.",
            "Pcs / sort / jama",
            "Rate",
            "Line / Ch. total",
            "Jama date / bill",
          ],
          rows
            .filter((r) => r.kind === "sale")
            .map((r) => [
              r.day + " · " + r.party,
              [r.detail.challan, r.detail.partyDesign, r.detail.design].join(
                " / ",
              ),
              [r.detail.pieces, r.detail.short, r.detail.accepted].join(" / "),
              amount(r.detail.rate),
              amount(r.amount) + " / " + amount(r.challanTotal),
              [r.detail.jamaDate, r.detail.jamaBill]
                .filter(Boolean)
                .join(" / "),
            ]),
        ),
      );
    if (key === "cashbook")
      result.push(
        table(
          key,
          "Rojmel · daily cash and bank book",
          [
            "Date",
            "Particulars",
            "Cr / Jama",
            "Dr / Udhar",
            "Cash Δ",
            "Bank Δ",
            "Balance",
          ],
          [
            [
              "Opening",
              "",
              "",
              "",
              amount(book.opening.cash),
              amount(book.opening.bank),
              amount(book.opening.cash + book.opening.bank),
            ],
            ...book.cashbook.map((r) => [
              r.day,
              r.detail,
              amount(r.credit),
              amount(r.debit),
              amount(r.cash),
              amount(r.bank),
              amount(r.balance),
            ]),
            [
              "Closing",
              "",
              "",
              "",
              amount(totals.cash),
              amount(totals.bank),
              amount(totals.closing),
            ],
          ],
        ),
      );
    if (key === "summary")
      result.push(
        table(
          key,
          "Monthly profit & loss",
          ["Particulars", "Amount"],
          [
            ...Object.entries(book.parties).map(([k, v]) => [
              "Sales · " + k,
              amount(v),
            ]),
            ["Total monthly sales", amount(totals.sales)],
            ...Object.entries(book.costs).map(([k, v]) => [k, amount(v)]),
            ["Total monthly expenses", amount(totals.costs)],
            ["Net profit / loss", amount(totals.profit)],
          ],
        ),
      );
  }
  return result;
}
