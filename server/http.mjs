import {
  businessDay,
  invoiceDetails,
  invoiceNumber,
  summarize,
} from "../lib/billing.mjs";
import { readJson } from "./api-utils.mjs";
import { BillingError, ensure } from "../lib/validation.mjs";
export async function handleApi(request, storage, makePdf) {
  const json = (data, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const url = new URL(request.url);
    const path = url.pathname
      .replace(/^\/api\/?/, "")
      .split("/")
      .filter(Boolean);
    const [resource, id, action] = path;
    const today = businessDay();
    const resources = [
      "customers",
      "products",
      "plans",
      "subscriptions",
      "invoices",
      "payments",
    ];
    ensure(
      path.length <= 3 &&
        (resources.includes(resource) ||
          (["workspace", "dashboard"].includes(resource) && !id)),
      "Resource not found.",
      404,
    );
    if (request.method === "GET") {
      const book = await storage.read({
        invoiceId: resource === "invoices" ? id : undefined,
        withReportIndex: resource === "workspace" || resource === "invoices",
      });
      if (resource === "workspace") return json({ book, today });
      if (resource === "dashboard") return json(summarize(book, today));
      const record = id ? book[resource].find((row) => row.id === id) : null;
      if (id) ensure(record, "Record not found.", 404);
      if (action) {
        ensure(
          resource === "invoices" && action === "pdf",
          "Resource not found.",
          404,
        );
        const details = invoiceDetails(book, record, today);
        return new Response(await makePdf(details), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition":
              'attachment; filename="' +
              invoiceNumber(details.sequence) +
              '.pdf"',
            "Cache-Control": "no-store",
          },
        });
      }
      if (resource === "invoices")
        return json(
          id
            ? invoiceDetails(book, record, today)
            : summarize(book, today).invoices,
        );
      if (resource === "customers" && id) {
        const invoices = summarize(book, today).invoices.filter(
          (i) => i.customerId === id,
        );
        return json({
          ...record,
          subscriptions: book.subscriptions.filter((s) => s.customerId === id),
          invoices,
          payments: invoices.flatMap((i) => i.payments),
        });
      }
      if (resource === "subscriptions" && id)
        return json({
          ...record,
          events: book.events
            .filter((e) => e.subscriptionId === id)
            .sort((a, b) => b.at.localeCompare(a.at)),
        });
      return json(record ?? book[resource]);
    }
    ensure(
      !action && resources.includes(resource),
      "Method is not supported here.",
      405,
    );
    const key = request.headers.get("Idempotency-Key");
    if (key) ensure(/^[\w-]{8,100}$/.test(key), "Invalid request key.");
    let data = {};
    if (request.method !== "DELETE") {
      data = await readJson(request);
    }
    const command = { method: request.method, resource, id, data, today };
    const signature = JSON.stringify([
      command.method,
      resource,
      id ?? null,
      data,
    ]);
    return json(
      await storage.write(command, key, signature),
      request.method === "POST" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof BillingError)
      return json({ error: error.message }, error.status);
    console.error("Billing API error", error.name, error.code ?? "");
    return json(
      {
        error:
          "The billing database could not complete this request. Check the connection and try again.",
      },
      503,
    );
  }
}
