import { prisma, exclusive } from "./db.mjs";
import { invoiceSources, defaultProfile } from "./workshop-store.mjs";
import { tables } from "../lib/billing.mjs";
import { BookChanges, mutate } from "./commands.mjs";
import { ensure } from "../lib/validation.mjs";

const models = {
  customers: "customer",
  products: "product",
  plans: "plan",
  subscriptions: "subscription",
  events: "subscriptionEvent",
  invoices: "invoice",
  lines: "invoiceLine",
  payments: "payment",
};
const dates = new Set([
  "createdOn",
  "startDate",
  "nextDate",
  "issuedOn",
  "dueOn",
  "paidOn",
]);
function encode(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, val]) => [
      key,
      dates.has(key)
        ? new Date(val + "T00:00:00Z")
        : key === "at"
          ? new Date(val)
          : val,
    ]),
  );
}
function decode(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, val]) => [
      key,
      val instanceof Date
        ? dates.has(key)
          ? val.toISOString().slice(0, 10)
          : val.toISOString()
        : val,
    ]),
  );
}
async function loadBook(tx, { invoiceId, withReportIndex = false } = {}) {
  const rows = await Promise.all(
    tables.map((table) =>
      table === "invoices"
        ? tx.invoice.findMany({ omit: { workshopAnnex: true } })
        : tx[models[table]].findMany(),
    ),
  );
  const book = Object.fromEntries(
    tables.map((table, i) => [table, rows[i].map(decode)]),
  );
  // The dashboard needs section labels. Only an individual invoice or PDF needs its frozen rows.
  if (invoiceId) {
    const invoice = book.invoices.find((row) => row.id === invoiceId);
    if (invoice)
      Object.assign(
        invoice,
        await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { workshopAnnex: true },
        }),
      );
  } else if (withReportIndex) {
    const snapshots =
      await tx.$queryRaw`SELECT id, "workshopAnnex" ->> 'month' AS month,
      "workshopAnnex" -> 'sections' AS sections FROM "Invoice" WHERE "workshopAnnex" IS NOT NULL`;
    const byId = new Map(
      snapshots.map(({ id, month, sections }) => [id, { month, sections }]),
    );
    for (const invoice of book.invoices)
      invoice.workshopAnnex = byId.get(invoice.id) || null;
  }
  return book;
}
export const postgres = {
  read(options) {
    return prisma.$transaction((tx) => loadBook(tx, options), {
      isolationLevel: "RepeatableRead",
    });
  },
  write(command, key, signature, actor) {
    signature = JSON.stringify([actor?.id || "system", signature]);
    return exclusive(async (tx) => {
      if (key) {
        const prior = await tx.mutation.findUnique({ where: { key } });
        if (prior) {
          ensure(
            prior.signature === signature,
            "This request key was already used for another change.",
            409,
          );
          return prior.result;
        }
      }
      const changes = new BookChanges(await loadBook(tx));
      const isInvoice =
        command.resource === "invoices" && command.method === "POST";
      const source = isInvoice
        ? await invoiceSources(tx, command.data)
        : { ids: [], lines: [] };
      if (isInvoice && source.lines.length) {
        ensure(Array.isArray(command.data.lines), "Enter valid invoice lines.");
        command = {
          ...command,
          data: {
            ...command.data,
            lines: [...command.data.lines, ...source.lines],
          },
        };
      }
      let result;
      if (
        command.resource === "customers" &&
        command.method === "DELETE" &&
        (await tx.workshopRecord.count({ where: { customerId: command.id } }))
      ) {
        ensure(
          !changes.book.subscriptions.some(
            (s) => s.customerId === command.id && s.status !== "cancelled",
          ),
          "Cancel active subscriptions before archiving.",
          409,
        );
        result = changes.edit("customers", command.id, { archived: true });
      } else result = mutate(changes, command);
      for (const op of changes.operations.filter(
        (o) => o.type === "create" && o.table === "invoices",
      )) {
        op.row.seller =
          (await tx.businessProfile.findUnique({
            where: { id: "business" },
          })) || defaultProfile;
        if (source.annex) op.row.workshopAnnex = source.annex;
      }
      for (const op of changes.operations) {
        const model = tx[models[op.table]];
        if (op.type === "create") await model.create({ data: encode(op.row) });
        if (op.type === "update")
          await model.update({
            where: { id: op.id },
            data: encode(op.changes),
          });
        if (op.type === "delete") await model.delete({ where: { id: op.id } });
      }
      if (source.ids.length)
        await tx.workshopRecord.updateMany({
          where: { id: { in: source.ids } },
          data: { invoiceId: result.id },
        });
      if (actor)
        await tx.auditEvent.create({
          data: {
            actor: actor.email,
            action: command.resource + "." + command.method.toLowerCase(),
            recordId: result.id,
          },
        });
      if (key) await tx.mutation.create({ data: { key, signature, result } });
      return result;
    });
  },
};
export async function seedDatabase(book) {
  return exclusive(async (tx) => {
    for (const table of tables)
      if (await tx[models[table]].count()) return false;
    for (const table of tables)
      if (book[table].length)
        await tx[models[table]].createMany({ data: book[table].map(encode) });
    return true;
  });
}
export const disconnect = () => prisma.$disconnect();
