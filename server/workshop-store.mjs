import { prisma, exclusive } from "./db.mjs";
import {
  clean,
  choose,
  dateValue,
  ensure,
  flag,
  integer,
} from "../lib/validation.mjs";
import { businessDay } from "../lib/billing.mjs";
import {
  dateString,
  expenses,
  flowSign,
  labels,
  marks,
  materials,
  monthlyBook,
  payrollKinds,
  reportTables,
  sections,
  sum,
} from "../lib/workshop.mjs";

export const defaultProfile = {
  name: "Billfold Workshop",
  address: "",
  contact: "",
  taxId: "",
  terms: "",
};
const midnight = (day) => new Date(day + "T00:00:00Z");
const optional = (v, label, n = 160) => clean(v ?? "", label, n, false);
export function monthRange(month) {
  dateValue(month + "-01", "Report month");
  const start = midnight(month + "-01"),
    end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { gte: start, lt: end };
}
const remaining = (r) =>
  r.amount - r.cash - r.bank - sum(r.settlements, "amount");
export async function loadMonth(tx, month) {
  const range = monthRange(month);
  const includeSettlements = {
    settlements: {
      where: { voidedAt: null, day: { lt: range.lt } },
      select: { amount: true },
    },
  };
  const [
    workers,
    attendance,
    records,
    invoices,
    receipts,
    prior,
    oldReceipts,
    customers,
    profile,
    priorBills,
  ] = await Promise.all([
    tx.workshopWorker.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] }),
    tx.workshopMark.findMany({
      where: { day: range },
      orderBy: [{ day: "asc" }, { workerId: "asc" }],
    }),
    tx.workshopRecord.findMany({
      where: { day: range },
      include: includeSettlements,
      orderBy: [{ day: "asc" }, { createdAt: "asc" }],
    }),
    tx.invoice.findMany({
      where: { issuedOn: range, stage: "issued" },
      include: {
        lines: true,
        workshopRecords: { select: { kind: true, amount: true } },
      },
    }),
    tx.payment.findMany({
      where: { paidOn: range, status: "successful" },
      include: { invoice: { select: { billTo: true, sequence: true } } },
    }),
    tx.workshopRecord.groupBy({
      by: ["kind", "category"],
      where: { day: { lt: range.gte }, voidedAt: null },
      _sum: { cash: true, bank: true },
    }),
    tx.payment.groupBy({
      by: ["method"],
      where: { paidOn: { lt: range.gte }, status: "successful" },
      _sum: { amount: true },
    }),
    tx.customer.findMany({
      where: { archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    tx.businessProfile.findUnique({ where: { id: "business" } }),
    tx.$queryRaw`SELECT p.id,p.day,p.party,p.category,p.reference,
      (p.amount-p.cash-p.bank-COALESCE(s.paid,0))::integer AS outstanding
      FROM "WorkshopRecord" p
      LEFT JOIN LATERAL (SELECT SUM(r.amount) AS paid FROM "WorkshopRecord" r
          WHERE r."parentId"=p.id AND r."voidedAt" IS NULL AND r.day<${range.lt}) s ON true
      WHERE p.day<${range.gte} AND p."voidedAt" IS NULL AND p.kind IN ('expense','material')
        AND p.amount>p.cash+p.bank AND p.amount-p.cash-p.bank>COALESCE(s.paid,0)
      ORDER BY p.day DESC`,
  ]);
  const opening = { cash: 0, bank: 0 };
  for (const p of prior) {
    const sign = flowSign(p.kind, p.category);
    opening.cash += sign * (p._sum.cash || 0);
    opening.bank += sign * (p._sum.bank || 0);
  }
  for (const p of oldReceipts)
    opening[p.method === "cash" ? "cash" : "bank"] += p._sum.amount || 0;
  const pack = ({ settlements, ...r }) => ({
    ...r,
    day: dateString(r.day),
    outstanding: ["expense", "material"].includes(r.kind)
      ? remaining({ ...r, settlements })
      : 0,
  });
  const book = monthlyBook({
    month,
    workers,
    records: records.map(pack),
    attendance: attendance.map((a) => ({ ...a, day: dateString(a.day) })),
    invoices,
    receipts,
    opening,
    customers,
    profile: profile || defaultProfile,
  });
  book.unpaidBills = [
    ...priorBills,
    ...book.records.filter((r) => !r.voidedAt && r.outstanding > 0),
  ].map((r) => ({
    id: r.id,
    day: dateString(r.day),
    party: r.party,
    category: r.category,
    reference: r.reference,
    outstanding: r.outstanding,
  }));
  return book;
}
export const readMonth = (month) =>
  prisma.$transaction((tx) => loadMonth(tx, month), {
    isolationLevel: "RepeatableRead",
    timeout: 30000,
  });
export function selectedSections(value) {
  ensure(
    Array.isArray(value) && value.length <= Object.keys(sections).length,
    "Select valid report sections.",
  );
  return [
    ...new Set(
      value.map((s) => choose(s, Object.keys(sections), "report section")),
    ),
  ];
}
export function materialDetail(d, category, memo) {
  const packs = d.packs,
    factor = materials[category].factor;
  ensure(
    Number.isFinite(packs) &&
      packs > 0 &&
      packs <= 100000 &&
      Math.abs(packs * 1000 - Math.round(packs * 1000)) < 1e-7,
    "Enter packs to three decimal places.",
  );
  const nominal = Math.round(packs * factor * 1000) / 1000;
  const units = integer(d.units ?? nominal, "Counted units", 1);
  ensure(
    units === nominal || memo,
    "Explain the difference between nominal and counted units.",
  );
  const rate = integer(d.rate, "Unit rate", 1);
  return {
    detail: { packs, factor, units, rate },
    amount: integer(units * rate, "Purchase total", 1),
  };
}
export function saleDetail(d) {
  const pieces = integer(d.pieces, "Pieces", 1, 10000),
    short = integer(d.short ?? 0, "Sort pieces", 0, pieces);
  const accepted = pieces - short,
    rate = integer(d.rate, "Rate", 1);
  return {
    detail: {
      challan: clean(d.challan, "Party challan", 40),
      partyDesign: optional(d.partyDesign, "Party design", 40),
      design: optional(d.design, "Design", 40),
      pieces,
      short,
      accepted,
      rate,
      jamaDate: d.jamaDate ? dateValue(d.jamaDate, "Jama date") : "",
      jamaBill: optional(d.jamaBill, "Jama bill", 50),
    },
    amount: integer(accepted * rate, "Sale total"),
  };
}
export async function addRecord(tx, d) {
  const day = dateValue(d.day, "Entry date");
  ensure(day <= businessDay(), "Entry date cannot be in the future.");
  const kind = choose(d.kind, Object.keys(labels), "entry type"),
    memo = optional(d.memo, "Particulars", 350);
  const row = {
    day: midnight(day),
    kind,
    category: "",
    party: optional(d.party, "Party / firm"),
    memo,
    reference: optional(d.reference, "Bill / reference", 70),
    cash: integer(d.cash ?? 0, "Cash"),
    bank: integer(d.bank ?? 0, "Bank"),
    amount: 0,
    detail: {},
  };
  const paid = integer(row.cash + row.bank, "Payment allocation");
  if (kind === "expense" || kind === "material") {
    row.category = choose(
      d.category,
      kind === "expense" ? expenses : Object.keys(materials),
      "category",
    );
    if (kind === "expense") row.amount = integer(d.amount, "Bill total", 1);
    else Object.assign(row, materialDetail(d, row.category, memo));
    ensure(paid <= row.amount, "Cash and bank exceed the bill.");
    if (paid < row.amount)
      ensure(row.party, "Enter the supplier for a credit bill.");
    if (d.customerId) {
      const c = await tx.customer.findFirst({
        where: { id: clean(d.customerId, "Customer ID"), archived: false },
      });
      ensure(c, "Select a current customer.");
      row.customerId = c.id;
    }
  } else if (kind === "settlement") {
    const parent = await tx.workshopRecord.findUnique({
      where: { id: clean(d.parentId, "Supplier bill") },
      include: {
        settlements: { where: { voidedAt: null }, select: { amount: true } },
      },
    });
    ensure(
      parent &&
        !parent.voidedAt &&
        ["expense", "material"].includes(parent.kind),
      "Supplier bill is unavailable.",
      409,
    );
    ensure(
      day >= dateString(parent.day) && paid > 0 && paid <= remaining(parent),
      "Payment exceeds baki or predates the bill.",
      409,
    );
    Object.assign(row, {
      amount: paid,
      parentId: parent.id,
      reference: row.reference || parent.reference,
      category: parent.category,
      party: parent.party,
    });
  } else if (kind === "sale") {
    const c = await tx.customer.findFirst({
      where: { id: clean(d.customerId, "Customer ID"), archived: false },
    });
    ensure(c, "Select a current customer.");
    ensure(!paid, "Record customer receipts against an issued invoice.");
    Object.assign(row, saleDetail(d), {
      customerId: c.id,
      party: c.name,
      category: "Jobwork",
    });
    ensure(
      !row.detail.jamaDate || row.detail.jamaDate >= day,
      "Jama date must be on or after the sale.",
    );
  } else if (payrollKinds.includes(kind)) {
    const w = await tx.workshopWorker.findUnique({
      where: { id: clean(d.workerId, "Worker ID") },
    });
    ensure(w, "Worker does not exist.");
    row.workerId = w.id;
    row.category = labels[kind];
    if (kind === "advance" || kind === "payout") {
      row.amount = integer(paid, "Cash + bank", 1);
    } else {
      ensure(!paid, "Record actual money paid as a salary payout.");
      row.amount = integer(
        d.amount,
        "Amount",
        kind === "adjustment" ? -2000000000 : 1,
      );
      ensure(row.amount !== 0, "Enter a non-zero amount.");
      if (kind === "adjustment")
        ensure(memo, "Enter a reason for this adjustment.");
      if (kind === "night") {
        ensure(
          Number.isFinite(d.days) &&
            d.days > 0 &&
            Number.isInteger(d.days * 2) &&
            d.days <= 31,
          "Enter valid night days.",
        );
        row.detail = { days: d.days };
      }
    }
  } else {
    row.category = choose(d.category, ["Credit", "Debit"], "direction");
    row.amount = integer(paid, "Cash + bank", 1);
    ensure(memo, "Enter the particulars.");
  }
  return tx.workshopRecord.create({ data: row, select: { id: true } });
}
async function change(tx, action, d, user) {
  if (action === "worker") {
    const fields = {
      name: clean(d.name, "Name", 100),
      job: clean(d.job, "Work / role", 80),
      machine: optional(d.machine, "Machine", 40),
      rate: integer(d.rate, "Monthly rate", 1),
    };
    if (d.id) {
      const id = clean(d.id, "Worker ID");
      ensure(
        await tx.workshopWorker.findUnique({ where: { id } }),
        "Worker not found.",
        404,
      );
      fields.active = flag(d.active);
      return tx.workshopWorker.update({
        where: { id },
        data: fields,
        select: { id: true },
      });
    }
    return tx.workshopWorker.create({ data: fields, select: { id: true } });
  }
  if (action === "attendance") {
    const date = dateValue(d.day, "Date");
    ensure(date <= businessDay(), "Attendance cannot be in the future.");
    const day = midnight(date);
    ensure(
      Array.isArray(d.entries) &&
        d.entries.length > 0 &&
        d.entries.length <= 500,
      "Select 1–500 changed marks.",
    );
    const seen = new Set();
    for (const a of d.entries) {
      const workerId = clean(a.workerId, "Worker ID");
      ensure(!seen.has(workerId), "Duplicate worker.");
      seen.add(workerId);
      const w = await tx.workshopWorker.findUnique({ where: { id: workerId } });
      ensure(w, "Unknown worker.");
      const where = { workerId_day: { workerId, day } };
      const old = await tx.workshopMark.findUnique({ where });
      ensure(
        (a.previous ?? null) ===
          (old
            ? old.status + "/" + old.extraHalfDays + "/" + old.machine
            : null),
        "Attendance changed since this sheet was opened. Reload it.",
        409,
      );
      if (!a.status) {
        if (old) await tx.workshopMark.delete({ where });
        continue;
      }
      ensure(w.active || old, "This worker is archived.");
      const status = choose(a.status, Object.keys(marks), "attendance"),
        extraHalfDays = integer(a.extraHalfDays ?? 0, "Extra half days", 0, 6);
      const machine = optional(
        a.machine ?? old?.machine ?? w.machine,
        "Machine",
        40,
      );
      await tx.workshopMark.upsert({
        where,
        create: { workerId, day, rate: w.rate, status, extraHalfDays, machine },
        update: { status, extraHalfDays, machine },
      });
    }
    return { id: date, count: seen.size };
  }
  if (action === "record") return addRecord(tx, d);
  if (action === "jama") {
    const id = clean(d.id, "Sale ID");
    const r = await tx.workshopRecord.findUnique({ where: { id } });
    ensure(r?.kind === "sale" && !r.voidedAt, "Sale is unavailable.", 409);
    const previous = [r.detail.jamaDate || "", r.detail.jamaBill || ""];
    ensure(
      JSON.stringify(previous) === JSON.stringify(d.previous),
      "Jama details changed. Reload this register.",
      409,
    );
    const jamaDate = d.jamaDate ? dateValue(d.jamaDate, "Jama date") : "",
      jamaBill = optional(d.jamaBill, "Jama bill number", 50);
    ensure(
      !jamaDate || jamaDate >= dateString(r.day),
      "Jama date must be on or after the sale.",
    );
    await tx.workshopRecord.update({
      where: { id },
      data: { detail: { ...r.detail, jamaDate, jamaBill } },
    });
    return { id };
  }
  if (action === "void") {
    const id = clean(d.id, "Entry ID"),
      reason = clean(d.reason, "Void reason", 250);
    const r = await tx.workshopRecord.findUnique({
      where: { id },
      include: {
        settlements: { where: { voidedAt: null }, select: { id: true } },
      },
    });
    ensure(
      r && !r.voidedAt && !r.invoiceId && !r.settlements.length,
      "This entry is already void, invoiced or has active settlements.",
      409,
    );
    return tx.workshopRecord.update({
      where: { id },
      data: { voidedAt: new Date(), voidReason: reason },
      select: { id: true },
    });
  }
  if (action === "profile") {
    ensure(
      user.role === "owner",
      "Only an owner can change seller details.",
      403,
    );
    const data = {
      name: clean(d.name, "Business name", 100),
      address: optional(d.address, "Address", 250),
      contact: optional(d.contact, "Contact", 120),
      taxId: optional(d.taxId, "Tax ID", 40),
      terms: optional(d.terms, "Invoice terms", 500),
    };
    await tx.businessProfile.upsert({
      where: { id: "business" },
      create: { id: "business", ...data },
      update: data,
    });
    return { id: "business" };
  }
  ensure(false, "Unknown workshop action.", 404);
}
export async function writeWorkshop(action, data, key, user) {
  ensure(
    typeof key === "string" && /^[\w-]{8,100}$/.test(key),
    "Use a valid request key.",
  );
  const signature = JSON.stringify(["workshop", user.id, action, data]);
  return exclusive(async (tx) => {
    const prior = await tx.mutation.findUnique({ where: { key } });
    if (prior) {
      ensure(prior.signature === signature, "Request key already used.", 409);
      return prior.result;
    }
    const result = await change(tx, action, data, user);
    await tx.auditEvent.create({
      data: {
        actor: user.email,
        action:
          "workshop." + action + (action === "record" ? "." + data.kind : ""),
        recordId: result.id,
      },
    });
    await tx.mutation.create({ data: { key, signature, result } });
    return result;
  });
}
export async function invoiceSources(tx, input) {
  if (!input.workshop) return { ids: [], lines: [] };
  const { ids = [], sections: requested = [], month } = input.workshop;
  ensure(
    Array.isArray(ids) &&
      ids.length <= 50 &&
      ids.every((id) => typeof id === "string") &&
      new Set(ids).size === ids.length,
    "Select distinct workshop entries.",
  );
  const keys = selectedSections(requested);
  const range = monthRange(month);
  const rows = await tx.workshopRecord.findMany({
    where: {
      id: { in: ids },
      day: range,
      customerId: input.customerId,
      voidedAt: null,
      invoiceId: null,
      kind: { in: ["sale", "expense", "material"] },
    },
  });
  ensure(
    rows.length === ids.length,
    "An entry was billed, voided or belongs to another customer or month.",
    409,
  );
  const lines = ids.map((id) => {
    const r = rows.find((row) => row.id === id);
    ensure(
      r.amount > 0 && dateString(r.day) <= input.issuedOn,
      "A source must have a positive amount and cannot postdate the invoice.",
    );
    if (r.kind === "sale")
      return {
        description: [
          "Jobwork",
          r.detail.challan,
          r.detail.partyDesign,
          r.detail.design,
          r.detail.pieces + " pcs less " + r.detail.short + " sort",
        ]
          .filter(Boolean)
          .join(" · "),
        quantity: r.detail.accepted,
        unitPrice: r.detail.rate,
      };
    return {
      description: [r.category, r.reference, r.memo]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 200),
      quantity: 1,
      unitPrice: r.amount,
    };
  });
  const annex = keys.length
    ? {
        month,
        sections: keys,
        tables: reportTables(await loadMonth(tx, month), keys),
      }
    : null;
  return { ids, lines, annex };
}
