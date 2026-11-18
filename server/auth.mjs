import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./db.mjs";
import { ensure } from "../lib/validation.mjs";

const derive = promisify(scrypt);
export const sessionName =
  process.env.NODE_ENV === "production" ? "__Host-workshop" : "workshop";
const ttl = 12 * 3600;
const digest = (value) => createHash("sha256").update(value).digest("hex");
export async function passwordHash(
  password,
  salt = randomBytes(16).toString("hex"),
) {
  const hash = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return salt + "." + hash.toString("hex");
}
const fake = "0".repeat(32) + "." + "0".repeat(128);
export async function authenticate(email, password) {
  ensure(
    typeof email === "string" &&
      email.length <= 254 &&
      typeof password === "string" &&
      password.length <= 256,
    "Invalid sign-in.",
    400,
  );
  email = email.trim().toLowerCase();
  const key = digest(email);
  const since = new Date(Date.now() - 15 * 60000);
  // Upsert is atomic across serverless instances.
  const [bucket] =
    await prisma.$queryRaw`INSERT INTO "LoginBucket" ("key", "attempts", "since") VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET "attempts" = CASE WHEN "LoginBucket"."since" < ${since} THEN 1 ELSE "LoginBucket"."attempts" + 1 END,
    "since" = CASE WHEN "LoginBucket"."since" < ${since} THEN NOW() ELSE "LoginBucket"."since" END RETURNING "attempts"`;
  ensure(
    bucket.attempts <= 10,
    "Too many attempts. Try again in 15 minutes.",
    429,
  );
  const staff = await prisma.staff.findUnique({ where: { email } });
  const existing = staff?.passwordHash || fake;
  const computed = await passwordHash(password, existing.split(".")[0]);
  ensure(
    timingSafeEqual(Buffer.from(computed), Buffer.from(existing)) &&
      staff &&
      !staff.disabled,
    "Email or password is incorrect.",
    401,
  );
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.staffSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }),
    prisma.loginBucket.deleteMany({
      where: {
        OR: [{ key }, { since: { lt: new Date(Date.now() - 86400000) } }],
      },
    }),
    prisma.staffSession.create({
      data: {
        digest: digest(token),
        staffId: staff.id,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    }),
  ]);
  return token;
}
export async function currentUser(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.staffSession.findUnique({
    where: { digest: digest(token) },
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabled: true,
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || session.staff.disabled)
    return null;
  return session.staff;
}
export function verifyOrigin(request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  ensure(origin === expected, "Open the app and retry this change.", 403);
}
export async function authorize(request) {
  verifyOrigin(request);
  const user = await currentUser(request.cookies.get(sessionName)?.value);
  ensure(user, "Sign in to your workspace.", 401);
  if (request.method !== "GET")
    ensure(user.role !== "viewer", "Your account has read-only access.", 403);
  return user;
}
export async function revoke(token) {
  if (token)
    await prisma.staffSession.deleteMany({ where: { digest: digest(token) } });
}
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: ttl,
};
