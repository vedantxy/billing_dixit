import { businessDay, emptyBook, isoDay, plusDays } from "../lib/billing.mjs";

// All contacts are fictional. Dates move with the first seed so the demo stays useful.
export function sampleBook(today = businessDay()) {
  const book = emptyBook();
  const names = [
    "Northstar Studio",
    "Orbit Labs",
    "Kite & Co.",
    "Saffron Design",
    "Atlas Works",
    "Paperplane Studio",
    "Indigo House",
    "Mango Media",
  ];
  const cities = [
    "Ahmedabad",
    "Pune",
    "Bengaluru",
    "Surat",
    "Mumbai",
    "Jaipur",
    "Chennai",
    "Patan",
  ];
  book.customers = names.map((name, i) => ({
    id: "c" + i,
    name,
    email:
      "billing@" +
      ["northstar", "orbit", "kite", "saffron", "atlas", "paperplane", "indigo", "mango"][i] +
      ".example",
    phone: "",
    address: cities[i] + ", India",
    archived: false,
    createdOn: plusDays(today, -210 + i * 7),
  }));
  book.products = [
    {
      id: "studio",
      name: "Studio Cloud",
      description: "A shared workspace for creative teams.",
      enabled: true,
    },
    {
      id: "support",
      name: "Priority Support",
      description: "Ongoing technical and design support.",
      enabled: true,
    },
    {
      id: "setup",
      name: "Implementation",
      description: "One-time setup and onboarding services.",
      enabled: true,
    },
  ];
  book.plans = [
    {
      id: "starter",
      productId: "studio",
      name: "Starter",
      cadence: "monthly",
      price: 149900,
      enabled: true,
    },
    {
      id: "growth",
      productId: "studio",
      name: "Growth",
      cadence: "monthly",
      price: 399900,
      enabled: true,
    },
    {
      id: "annual",
      productId: "studio",
      name: "Team annual",
      cadence: "yearly",
      price: 3598800,
      enabled: true,
    },
    {
      id: "care",
      productId: "support",
      name: "Care",
      cadence: "monthly",
      price: 649900,
      enabled: true,
    },
    {
      id: "launch",
      productId: "setup",
      name: "Onboarding",
      cadence: "once",
      price: 950000,
      enabled: true,
    },
  ];
  const planOrder = [1, 3, 0, 2, 3, 1, 0, 1];
  const offsets = [2, 4, 6, 11, 19, -3, 13, 22];
  book.subscriptions = names.map((_, i) => {
    const p = book.plans[planOrder[i]];
    const startDate = plusDays(today, -210 + i * 7);
    const nextDate = plusDays(today, offsets[i]);
    const status = i === 6 ? "paused" : i === 7 ? "cancelled" : "active";
    return {
      id: "sub" + i,
      customerId: "c" + i,
      planId: p.id,
      planLabel: book.products.find((x) => x.id === p.productId).name + " · " + p.name,
      price: p.price,
      cadence: p.cadence,
      status,
      startDate,
      nextDate,
      anchorDay: Number(nextDate.slice(8)),
    };
  });
  book.events = book.subscriptions.flatMap((sub) => {
    const e = {
      id: "event-" + sub.id,
      subscriptionId: sub.id,
      at: sub.startDate + "T09:00:00.000Z",
      message: "Subscription started on " + sub.planLabel + ".",
    };
    return sub.status === "active"
      ? [e]
      : [
          e,
          {
            ...e,
            id: e.id + "-status",
            at: plusDays(today, -3) + "T12:00:00.000Z",
            message: "Status changed to " + sub.status + ".",
          },
        ];
  });
  let seq = 1000;
  function invoice(c, day, due, rupees, stage, collected, title, subId = null) {
    const customer = book.customers[c];
    const id = "inv" + ++seq;
    book.invoices.push({
      id,
      sequence: seq,
      customerId: customer.id,
      subscriptionId: subId,
      billTo: customer.name,
      billEmail: customer.email,
      billAddress: customer.address,
      stage,
      issuedOn: day,
      dueOn: due,
      discountBps: 0,
      taxBps: 0,
      notes: "",
    });
    book.lines.push({
      id: "line" + seq,
      invoiceId: id,
      position: 0,
      planId: subId ? book.subscriptions[c].planId : null,
      description: title,
      quantity: 1,
      unitPrice: rupees * 100,
    });
    if (collected)
      book.payments.push({
        id: "pay" + seq,
        invoiceId: id,
        amount: collected * 100,
        paidOn: day,
        method: ["upi", "bank_transfer", "card"][c % 3],
        status: "successful",
      });
    return id;
  }
  const current = new Date(today + "T00:00:00Z");
  const counts = [2, 3, 2, 3, 4, 3];
  for (let m = 0; m < 6; m++) {
    for (let n = 0; n < counts[m]; n++) {
      const guessed = isoDay(
        new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + m - 5, 1 + n * 3)),
      );
      const day = guessed > today ? today : guessed;
      const rupees = [4200, 6400, 3900, 7800, 9450, 6850][m] + n * 600;
      invoice(
        (m + n) % names.length,
        day,
        plusDays(day, 7),
        rupees,
        "issued",
        rupees,
        "Studio services",
      );
    }
  }
  invoice(
    4,
    plusDays(today, -11),
    plusDays(today, -4),
    6499,
    "issued",
    1500,
    book.subscriptions[4].planLabel,
    "sub4",
  );
  invoice(
    3,
    plusDays(today, -8),
    plusDays(today, -2),
    9500,
    "issued",
    0,
    "Implementation · Onboarding",
  );
  invoice(
    2,
    plusDays(today, -3),
    plusDays(today, 4),
    1499,
    "draft",
    0,
    book.subscriptions[2].planLabel,
    "sub2",
  );
  const pending = invoice(
    1,
    plusDays(today, -2),
    plusDays(today, 5),
    6499,
    "issued",
    0,
    book.subscriptions[1].planLabel,
    "sub1",
  );
  book.payments.push({
    id: "pay-wait",
    invoiceId: pending,
    amount: 649900,
    paidOn: plusDays(today, -1),
    method: "bank_transfer",
    status: "pending",
  });
  invoice(
    0,
    today,
    plusDays(today, 7),
    3999,
    "issued",
    3999,
    book.subscriptions[0].planLabel,
    "sub0",
  );
  return book;
}
