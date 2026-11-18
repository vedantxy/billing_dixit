import { NextResponse } from "next/server";
import {
  authenticate,
  currentUser,
  revoke,
  verifyOrigin,
  cookieOptions,
  sessionName,
} from "../../../server/auth.mjs";
import { apiError, json, readJson } from "../../../server/api-utils.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    return json({
      user: await currentUser(req.cookies.get(sessionName)?.value),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req) {
  try {
    verifyOrigin(req);
    const { email, password } = await readJson(req, 4096);
    const token = await authenticate(email, password);
    const out = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    out.cookies.set(sessionName, token, cookieOptions);
    return out;
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(req) {
  try {
    verifyOrigin(req);
    await revoke(req.cookies.get(sessionName)?.value);
    const out = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    out.cookies.set(sessionName, "", { ...cookieOptions, maxAge: 0 });
    return out;
  } catch (e) {
    return apiError(e);
  }
}
