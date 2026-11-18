import { BillingError, ensure } from "../lib/validation.mjs";
export const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export function apiError(error) {
  if (error instanceof BillingError)
    return json({ error: error.message }, error.status);
  if (error.code === "P2002")
    return json(
      { error: "This record already exists. Refresh and try again." },
      409,
    );
  console.error("Workshop request failed", error.name, error.code || "");
  return json(
    {
      error:
        "Could not complete this request. Check the database connection and try again.",
    },
    503,
  );
}
export async function readJson(request, max = 64000) {
  ensure(
    request.headers.get("content-type")?.startsWith("application/json"),
    "Send JSON data.",
    415,
  );
  ensure(
    Number(request.headers.get("content-length") || 0) <= max,
    "Request too large.",
    413,
  );
  const reader = request.body?.getReader();
  ensure(reader, "Missing request body.");
  const chunks = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > max) {
      await reader.cancel();
      throw new BillingError("Request too large.", 413);
    }
    chunks.push(Buffer.from(part.value));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    ensure(
      body && typeof body === "object" && !Array.isArray(body),
      "Enter a JSON object.",
    );
    return body;
  } catch {
    throw new BillingError("Enter a valid JSON object.");
  }
}
