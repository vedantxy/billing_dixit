import { readFile } from "node:fs/promises";
import path from "node:path";
import { handleApi } from "../../../server/http.mjs";
import { postgres } from "../../../server/postgres.mjs";

import { authorize } from "../../../server/auth.mjs";
import { apiError } from "../../../server/api-utils.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function download(invoice) {
  const { invoicePdf } = await import("../../../server/pdf.mjs");
  return invoicePdf(invoice, (name) =>
    readFile(path.join(process.cwd(), "public/fonts/invoice", name)),
  );
}
async function handler(request) {
  try {
    const user = await authorize(request);
    return await handleApi(
      request,
      {
        read: postgres.read,
        write: (cmd, key, sig) => postgres.write(cmd, key, sig, user),
      },
      download,
    );
  } catch (error) {
    return apiError(error);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
