import { readFile } from "node:fs/promises";
import path from "node:path";
import { authorize } from "../../../server/auth.mjs";
import { apiError, json, readJson } from "../../../server/api-utils.mjs";
import {
  readMonth,
  selectedSections,
  writeWorkshop,
} from "../../../server/workshop-store.mjs";
import { prisma } from "../../../server/db.mjs";
import { ensure } from "../../../lib/validation.mjs";
import { reportTables } from "../../../lib/workshop.mjs";
import { businessDay } from "../../../lib/billing.mjs";
import { reportCsv } from "../../../lib/workshop-export.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    const user = await authorize(req),
      q = new URL(req.url).searchParams;
    if (q.has("audit")) {
      ensure(
        user.role === "owner",
        "Audit access requires an owner account.",
        403,
      );
      return json(
        await prisma.auditEvent.findMany({
          orderBy: { at: "desc" },
          take: 100,
        }),
      );
    }
    const month = q.get("month") || businessDay().slice(0, 7),
      book = await readMonth(month),
      format = q.get("format");
    if (!format) return json(book);
    ensure(
      ["pdf", "csv"].includes(format),
      "Choose a supported report format.",
    );
    const keys = selectedSections((q.get("sections") || "summary").split(",")),
      tables = reportTables(book, keys);
    const data =
      format === "pdf"
        ? await (
            await import("../../../server/pdf.mjs")
          ).workshopPdf({ month, tables, profile: book.profile }, (name) =>
            readFile(path.join(process.cwd(), "public/fonts/invoice", name)),
          )
        : reportCsv(tables);
    return new Response(data, {
      headers: {
        "Content-Type":
          format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="workshop-' + month + "." + format + '"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req) {
  try {
    const user = await authorize(req),
      { action, ...data } = await readJson(req);
    return json(
      await writeWorkshop(
        action,
        data,
        req.headers.get("Idempotency-Key"),
        user,
      ),
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
