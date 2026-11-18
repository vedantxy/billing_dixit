// Run against a fresh disposable database. The test creates fictional staff and accounting records.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
if (!process.env.TEST_DATABASE_URL)
  throw Error(
    "Set TEST_DATABASE_URL to a fresh disposable PostgreSQL database.",
  );
const port = Number(process.env.TEST_PORT || 3318),
  origin = "http://localhost:" + port;
process.env.APP_ORIGIN = origin;
process.env.NEXT_TELEMETRY_DISABLED = "1";
const cli = (file, ...args) =>
  execFileSync(process.execPath, [file, ...args], { stdio: "inherit" });
cli("node_modules/prisma/build/index.js", "migrate", "deploy");
const { prisma } = await import("../../server/db.mjs");
const { passwordHash } = await import("../../server/auth.mjs");
assert.equal(await prisma.staff.count(), 0, "Use an empty test database.");
assert.equal(await prisma.customer.count(), 0, "Use an empty test database.");
const password = randomBytes(24).toString("hex"),
  passwordHashValue = await passwordHash(password);
for (const role of ["owner", "viewer"]) {
  await prisma.staff.create({
    data: {
      name: role + " Fixture",
      role,
      email: role + "@example.test",
      passwordHash: passwordHashValue,
    },
  });
}
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    String(port),
    "-H",
    "127.0.0.1",
  ],
  { env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit" },
);
async function call(
  path,
  { method = "GET", cookie = "", body, key = randomUUID(), from = origin } = {},
) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      origin: from,
      cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json")
    ? await r.json()
    : ct.includes("pdf")
      ? new Uint8Array(await r.arrayBuffer())
      : await r.text();
  return { status: r.status, data, headers: r.headers };
}
function expect(r, status = 201) {
  assert.equal(r.status, status, JSON.stringify(r.data).slice(0, 250));
  return r.data;
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await call("/api/session")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, "Next server started");
  async function login(role) {
    const r = await call("/api/session", {
      method: "POST",
      body: { email: role + "@example.test", password },
    });
    expect(r, 200);
    return r.headers.get("set-cookie").split(";")[0];
  }
  const cookie = await login("owner"),
    viewer = await login("viewer");
  const post = (path, body, key) =>
    call(path, { method: "POST", cookie, body, key });
  const enter = async (action, data) =>
    expect(await post("/api/workshop", { action, ...data }));
  expect(await call("/api/workspace"), 401);
  expect(await call("/api/invoices/missing/pdf"), 401);
  expect(
    await call("/api/workshop", {
      method: "POST",
      cookie: viewer,
      body: { action: "worker" },
    }),
    403,
  );
  expect(
    await call("/api/workshop", {
      method: "POST",
      cookie,
      from: "https://invalid.example",
      body: { action: "worker" },
    }),
    403,
  );
  const { id: customerId } = expect(
    await post("/api/customers", {
      name: "Fictional Weave Studio",
      email: "weave@example.test",
    }),
  );
  const { id: otherId } = expect(
    await post("/api/customers", {
      name: "Sample Loom Works",
      email: "loom@example.test",
    }),
  );
  await enter("profile", {
    name: "Loom Test Works",
    address: "Sample Lane",
    terms: "Payment within 15 days.",
  });
  const { id: workerId } = await enter("worker", {
    name: "Fixture Operator",
    job: "Operator",
    machine: "M08",
    rate: 3000000,
  });
  const month = "2025-03",
    day = month + "-05";
  await enter("attendance", {
    day,
    entries: [{ workerId, status: "P", extraHalfDays: 1, previous: null }],
  });
  expect(
    await post("/api/workshop", {
      action: "attendance",
      day,
      entries: [{ workerId, status: "H", previous: null }],
    }),
    409,
  );
  await enter("record", {
    kind: "advance",
    day,
    workerId,
    cash: 20000,
    bank: 10000,
    party: "Fixture firm",
  });
  await enter("record", {
    kind: "adjustment",
    day,
    workerId,
    amount: -1200,
    memo: "Corrected sheet",
  });
  const { id: expense } = await enter("record", {
    kind: "expense",
    category: "MAMA",
    day,
    party: "Supplier",
    amount: 10000,
    bank: 1000,
    cash: 0,
  });
  await enter("record", {
    kind: "settlement",
    parentId: expense,
    day,
    bank: 4000,
  });
  expect(
    await post("/api/workshop", {
      action: "record",
      kind: "settlement",
      parentId: expense,
      day,
      bank: 6000,
    }),
    409,
  );
  await enter("record", {
    kind: "material",
    category: "Syroski",
    day,
    packs: 1.2,
    units: 47,
    rate: 100,
    party: "Supplier",
    memo: "One packet short",
  });
  await enter("record", {
    kind: "cashbook",
    category: "Credit",
    day: "2025-02-28",
    cash: 100000,
    bank: 200000,
    memo: "Opening balances",
  });
  const { id: sale } = await enter("record", {
    kind: "sale",
    day,
    customerId,
    challan: "CH-7",
    partyDesign: "PD-1",
    design: "D-1",
    pieces: 40,
    short: 2,
    rate: 3000,
    jamaBill: "J-1",
    jamaDate: day,
  });
  const make = {
    customerId,
    issuedOn: day,
    dueOn: "2025-03-25",
    lines: [],
    workshop: { month, ids: [sale], sections: ["payroll", "sales"] },
  };
  expect(await post("/api/invoices", { ...make, customerId: otherId }), 409);
  const key = randomUUID();
  const [a, b] = await Promise.all([
    post("/api/invoices", make, key),
    post("/api/invoices", make, key),
  ]);
  const invoice = expect(a);
  assert.equal(invoice.id, expect(b).id);
  expect(await post("/api/invoices", make), 409);
  expect(
    await post("/api/workshop", {
      action: "void",
      id: sale,
      reason: "Duplicate",
    }),
    409,
  );
  await enter("record", {
    kind: "bonus",
    day,
    workerId,
    amount: 10000,
    memo: "Later bonus",
  });
  const doc = expect(
    await call("/api/invoices/" + invoice.id, { cookie }),
    200,
  );
  assert.equal(doc.total, 114000);
  assert.equal(doc.seller.name, "Loom Test Works");
  const detailed = doc.workshopAnnex.tables.find(
    (t) => t.title === "Pay calculation",
  );
  assert.ok(!JSON.stringify(detailed).includes("Later bonus"));
  await enter("jama", {
    id: sale,
    jamaDate: "2025-03-09",
    jamaBill: "J-2",
    previous: [day, "J-1"],
  });
  expect(
    await post("/api/workshop", {
      action: "jama",
      id: sale,
      jamaDate: day,
      jamaBill: "STALE",
      previous: [day, "J-1"],
    }),
    409,
  );
  assert.ok(JSON.stringify(doc.workshopAnnex).includes("J-1"));
  const nextMonth = expect(
    await call("/api/workshop?month=2025-04", { cookie }),
    200,
  );
  assert.equal(
    nextMonth.unpaidBills.find((r) => r.id === expense).outstanding,
    5000,
  );
  const plain = expect(
    await post("/api/invoices", {
      customerId,
      issuedOn: day,
      dueOn: day,
      lines: [{ description: "Sample service", quantity: 1, unitPrice: 100 }],
    }),
  );
  assert.ok(!plain.workshopAnnex);
  await post("/api/payments", {
    invoiceId: invoice.id,
    amount: 10000,
    paidOn: day,
    status: "successful",
    method: "upi",
  }).then((r) => expect(r));
  const book = expect(
    await call("/api/workshop?month=" + month, { cookie }),
    200,
  );
  assert.equal(book.totals.sales, 114100);
  assert.equal(book.payroll[0].due, 128800);
  assert.equal(book.opening.cash, 100000);
  assert.equal(book.opening.bank, 200000);
  assert.equal(book.records.find((r) => r.id === expense).outstanding, 5000);
  assert.equal(book.totals.closing, 275000);
  const pdf = expect(
    await call("/api/invoices/" + invoice.id + "/pdf", { cookie }),
    200,
  );
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 2);
  const workspace = expect(await call("/api/workspace", { cookie }), 200);
  const index = workspace.book.invoices.find(
    (r) => r.id === invoice.id,
  ).workshopAnnex;
  assert.deepEqual(index.sections, ["payroll", "sales"]);
  assert.equal(index.tables, undefined);
  const standalone = expect(
    await call(
      "/api/workshop?month=" +
        month +
        "&format=pdf&sections=payroll,sales,cashbook",
      { cookie },
    ),
    200,
  );
  assert.ok((await PDFDocument.load(standalone)).getPageCount() >= 1);
  const csv = expect(
    await call(
      "/api/workshop?month=" + month + "&format=csv&sections=payroll,sales",
      { cookie },
    ),
    200,
  );
  assert.ok(csv.includes("Fixture Operator") && csv.includes("CH-7"));
  expect(await call("/api/workshop?audit=1", { cookie: viewer }), 403);
  assert.ok(
    expect(await call("/api/workshop?audit=1", { cookie }), 200).length >= 12,
  );
  if (process.env.TEST_ARTIFACT_DIR) {
    await writeFile(process.env.TEST_ARTIFACT_DIR + "/invoice.pdf", pdf);
    await writeFile(process.env.TEST_ARTIFACT_DIR + "/salary.pdf", standalone);
  }
  if (process.env.TEST_BROWSER === "1") {
    const proc = spawn("python", ["tests/integration/browser.py"], {
      env: { ...process.env, QA_ORIGIN: origin, QA_PASSWORD: password },
      stdio: "inherit",
    });
    assert.equal(
      await new Promise((resolve) => proc.on("exit", resolve)),
      0,
      "Browser checks passed",
    );
  }
  expect(await call("/api/session", { method: "DELETE", cookie }), 200);
  expect(await call("/api/workspace", { cookie }), 401);
  console.log(
    "Passed production API integration: access control, stale marks, balances, cross-party protection, concurrent retries, frozen invoices, PDF/CSV, audit and sign out.",
  );
} finally {
  app.kill();
  await prisma.$disconnect();
}
