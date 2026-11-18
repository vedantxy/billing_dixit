import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { prisma } from "../server/db.mjs";
import { passwordHash } from "../server/auth.mjs";

const [emailArg, role = "owner", nameArg] = process.argv.slice(2);
const email = (emailArg || "").trim().toLowerCase(),
  name = (nameArg || email.split("@")[0]).trim();
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  email.length > 254 ||
  name.length > 100 ||
  !["owner", "accountant", "viewer"].includes(role)
) {
  console.error('Usage: npm run staff -- owner@example.com owner "Owner name"');
  process.exit(1);
}
function promptPassword() {
  return new Promise((resolve) => {
    const sink = new Writable({
      write(_chunk, _enc, done) {
        done();
      },
    });
    const rl = createInterface({
      input: process.stdin,
      output: sink,
      terminal: true,
    });
    process.stdout.write("New password (12 or more characters, hidden): ");
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}
try {
  const password =
    process.env.WORKSHOP_STAFF_PASSWORD || (await promptPassword());
  if (password.length < 12 || password.length > 256)
    throw Error("Use a password of 12–256 characters.");
  const hash = await passwordHash(password);
  await prisma.$transaction(async (tx) => {
    const u = await tx.staff.upsert({
      where: { email },
      create: { email, role, name, passwordHash: hash },
      update: { role, name, passwordHash: hash, disabled: false },
    });
    await tx.staffSession.deleteMany({ where: { staffId: u.id } });
    await tx.auditEvent.create({
      data: {
        actor: "Database administrator",
        action: "staff.provision",
        recordId: u.id,
      },
    });
  });
  console.log("Staff account saved. Previous sessions have expired.");
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
