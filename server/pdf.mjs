import "regenerator-runtime/runtime.js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { invoiceNumber, money, niceDate, statuses } from "../lib/billing.mjs";

const ink = rgb(0.067, 0.094, 0.153);       // #111827 dark
const muted = rgb(0.42, 0.45, 0.50);          // gray muted
const gold = rgb(0.788, 0.659, 0.298);         // #C9A84C gold
const goldDark = rgb(0.659, 0.529, 0.227);     // darker gold
const pale = rgb(0.898, 0.914, 0.929);         // light gray line
const headerBg = rgb(0.102, 0.114, 0.137);     // #1A1D23 dark charcoal

export const invoicePdf = (invoice, loadFont) =>
  documentPdf(invoice, invoice.workshopAnnex, loadFont);
export const workshopPdf = (statement, loadFont) =>
  documentPdf(null, statement, loadFont);
async function documentPdf(inv, statement, loadFont) {
  const business = inv?.seller ||
    statement?.profile || { name: "I Shree Enterprise" };
  const documentId = inv ? invoiceNumber(inv.sequence) : statement.month;
  let runningTitle = inv ? "Tax Invoice" : "Statement of Accounts";
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(documentId + " — " + business.name);

  // Load official I Shree Enterprise letterpad image (embedded Base64 + filesystem fallback)
  let letterpadImage = null;
  try {
    const { LETTERPAD_BASE64 } = await import("./letterpad-data.mjs");
    if (LETTERPAD_BASE64) {
      const imgBuf = Buffer.from(LETTERPAD_BASE64, "base64");
      letterpadImage = await pdf.embedJpg(imgBuf);
    }
  } catch (err) {
    console.error("Letterpad base64 embed error:", err);
  }
  if (!letterpadImage) {
    try {
      const { readFile } = await import("node:fs/promises");
      const path = await import("node:path");
      const imgBuf = await readFile(path.join(process.cwd(), "public/letterpad.jpg"));
      letterpadImage = await pdf.embedJpg(imgBuf);
    } catch (err) {
      console.error("Letterpad file embed fallback error:", err);
    }
  }

  const content = [
    JSON.stringify(business),
    JSON.stringify(statement),
    inv?.billTo,
    inv?.billEmail,
    inv?.billAddress,
    inv?.notes,
    ...(inv?.lines || []).map((l) => l.description),
  ].join(" ");
  const embed = async (name) =>
    pdf.embedFont(await loadFont(name + ".ttf"), { subset: true });
  const [regular, bold, gujarati, hindi] = await Promise.all([
    embed("NotoSans-Regular"),
    embed("NotoSans-Bold"),
    /[\u0a80-\u0aff]/u.test(content) ? embed("NotoSansGujarati-Regular") : null,
    /[\u0900-\u097f]/u.test(content)
      ? embed("NotoSansDevanagari-Regular")
      : null,
  ]);
  const runs = (text, font) => {
    const parts = [];
    for (const char of String(text)) {
      const chosen =
        (/[\u0a80-\u0aff]/u.test(char) && gujarati) ||
        (/[\u0900-\u097f]/u.test(char) && hindi) ||
        font;
      if (parts.length && parts.at(-1).font === chosen)
        parts.at(-1).text += char;
      else parts.push({ font: chosen, text: char });
    }
    return parts;
  };
  const width = (str, font, size) =>
    runs(str, font).reduce(
      (sum, run) => sum + run.font.widthOfTextAtSize(run.text, size),
      0,
    );
  let page, y;
  function draw(
    str,
    x,
    yy,
    size = 10,
    font = regular,
    color = ink,
    right = false,
  ) {
    if (right) x -= width(str, font, size);
    for (const run of runs(str, font)) {
      page.drawText(run.text, { x, y: yy, size, font: run.font, color });
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  }
  const rule = (yy, color = pale) =>
    page.drawLine({
      start: { x: 46, y: yy },
      end: { x: 549, y: yy },
      thickness: 0.7,
      color,
    });
  function freshPage() {
    page = pdf.addPage([595, 842]);
    if (letterpadImage) {
      // Exact factory letterpad template with emblem logo, header and watermark!
      page.drawImage(letterpadImage, {
        x: 0,
        y: 0,
        width: 595,
        height: 842,
      });
      // Document title and ID on top right
      draw(runningTitle.toUpperCase(), 549, 810, 8.5, bold, rgb(0.2, 0.25, 0.3), true);
      draw(documentId, 549, 796, 11, bold, ink, true);
      y = 740;
    } else {
      // Vector header fallback
      page.drawRectangle({
        x: 0,
        y: 787,
        width: 595,
        height: 55,
        color: headerBg,
      });
      const shreeLabel = "I SHREE";
      draw(shreeLabel, 46, 810, 16, bold, rgb(1, 1, 1));
      const shreeW = width(shreeLabel, bold, 16);
      draw("ENTERPRISE", 46 + shreeW + 6, 810, 16, bold, gold);
      draw(runningTitle.toUpperCase(), 549, 815, 8, regular, pale, true);
      draw(documentId, 549, 804, 10, bold, rgb(1, 1, 1), true);
      page.drawLine({
        start: { x: 0, y: 775 },
        end: { x: 595, y: 775 },
        thickness: 1.5,
        color: gold,
      });
      y = 750;
    }
  }
  function room(h) {
    if (y - h < 75) freshPage();
  }
  function wrap(text, max, size = 10, font = regular) {
    const lines = [];
    for (const paragraph of String(text || "").split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/)) {
        const trial = line ? line + " " + word : word;
        if (line && width(trial, font, size) > max) {
          lines.push(line);
          line = "";
        }
        if (width(word, font, size) > max) {
          for (const char of word) {
            if (line && width(line + char, font, size) > max) {
              lines.push(line);
              line = "";
            }
            line += char;
          }
        } else line += (line ? " " : "") + word;
      }
      if (line) lines.push(line);
    }
    return lines;
  }
  if (inv) {
    freshPage();
    if (letterpadImage) {
      // Letterpad already has the official logo & name
      const contactInfo = [business.address, business.contact, business.taxId ? "GSTIN: " + business.taxId : ""]
        .filter(Boolean)
        .join(" · ");
      if (contactInfo) {
        draw(contactInfo, 46, y, 8.5, regular, muted);
        y -= 14;
      }
    } else {
      for (const line of wrap(business.name, 495, 18, bold)) {
        draw(line, 46, y, 18, bold, ink);
        y -= 24;
      }
      for (const line of wrap(
        [business.address, business.contact, business.taxId]
          .filter(Boolean)
          .join(" · "),
        495,
        9,
      )) {
        draw(line, 46, y, 9, regular, muted);
        y -= 13;
      }
      y -= 6;
      rule(y, pale);
    }

    y -= 14;
    draw(
      statuses[inv.status] + "  ·  " + niceDate(inv.issuedOn, true),
      46,
      y,
      10,
      regular,
      muted,
    );
    y -= 28;
    draw("BILL TO", 46, y, 9, bold, muted);
    draw("DUE DATE", 549, y, 9, bold, muted, true);
    y -= 16;
    draw(niceDate(inv.dueOn, true), 549, y, 10.5, regular, ink, true);
    for (const line of wrap(inv.billTo, 340, 12, bold)) {
      draw(line, 46, y, 12, bold);
      y -= 16;
    }
    for (const line of [
      ...wrap(inv.billEmail, 350),
      ...wrap(inv.billAddress, 400),
    ]) {
      draw(line, 46, y, 9.5, regular, muted);
      y -= 13;
    }
    y -= 14;
    function tableHead() {
      // Light gold header background
      const headerHeight = 28;
      page.drawRectangle({
        x: 46,
        y: y - headerHeight + 14,
        width: 503,
        height: headerHeight,
        color: rgb(0.992, 0.969, 0.898),
      });
      draw("Description", 49, y, 10, bold, goldDark);
      draw("Qty", 353, y, 10, bold, goldDark, true);
      draw("Unit price", 447, y, 10, bold, goldDark, true);
      draw("Amount", 549, y, 10, bold, goldDark, true);
      y -= 9;
      rule(y, pale);
      y -= 20;
    }
    tableHead();
    for (const row of inv.lines) {
      const lines = wrap(row.description, 266);
      if (y - lines.length * 15 < 80) {
        freshPage();
        tableHead();
      }
      draw(String(row.quantity), 353, y, 10, regular, ink, true);
      draw(money(row.unitPrice), 447, y, 10, regular, ink, true);
      draw(money(row.unitPrice * row.quantity), 549, y, 10, regular, ink, true);
      for (const line of lines) {
        draw(line, 46, y);
        y -= 15;
      }
      y -= 8;
    }
    room(150);
    rule(y, pale);
    y -= 22;
    const amounts = [
      ["Subtotal", inv.subtotal],
      [
        "Discount (" + inv.discountBps / 100 + "%)",
        inv.discount ? -inv.discount : 0,
      ],
      ["Tax (" + inv.taxBps / 100 + "%)", inv.tax],
      ["Total", inv.total],
      ["Received", inv.collected],
      ["Balance due", inv.balance],
    ];
    for (const [label, amount] of amounts) {
      const strong = label === "Total" || label === "Balance due";
      draw(label, 305, y, 10, strong ? bold : regular);
      draw(
        money(amount),
        549,
        y,
        10,
        strong ? bold : regular,
        strong ? gold : ink,
        true,
      );
      y -= 19;
    }
    if (inv.notes || business.terms) {
      room(50);
      y -= 8;
      draw("Notes", 46, y, 10, bold);
      y -= 16;
      for (const line of wrap(
        [inv.notes, business.terms].filter(Boolean).join("\n"),
        495,
      )) {
        room(18);
        draw(line, 46, y);
        y -= 15;
      }
    }
  }
  if (statement) {
    runningTitle = inv
      ? "Invoice attachment · " + statement.month
      : "Statement of Accounts";
    freshPage();
    if (letterpadImage) {
      const contactInfo = [business.address, business.contact, business.taxId ? "GSTIN: " + business.taxId : ""]
        .filter(Boolean)
        .join(" · ");
      if (contactInfo) {
        draw(contactInfo, 46, y, 8.5, regular, muted);
        y -= 14;
      }
    } else {
      for (const line of wrap(business.name, 500, 18, bold)) {
        draw(line, 46, y, 18, bold, ink);
        y -= 24;
      }
    }
    draw("Accounting month  /  " + statement.month, 46, y, 11, regular, muted);
    y -= 30;
    for (const table of statement.tables) {
      const cellWidth = 503 / table.headers.length,
        size = 8.5,
        leading = 12;
      const cellLines = (row) =>
        row.map((cell) => wrap(String(cell ?? ""), cellWidth - 8, size));
      const header = () => {
        const lines = cellLines(table.headers),
          height = Math.max(1, ...lines.map((l) => l.length)) * leading + 7;
        page.drawRectangle({
          x: 46,
          y: y - height + 9,
          width: 503,
          height,
          color: rgb(0.992, 0.969, 0.898),
        });
        lines.forEach((lines, i) =>
          lines.forEach((line, n) =>
            draw(line, 49 + i * cellWidth, y - n * leading, size, bold, goldDark),
          ),
        );
        y -= height;
      };
      const title = () => {
        draw(table.title, 46, y, 12, bold);
        y -= 21;
        header();
      };
      room(82);
      title();
      if (!table.rows.length) {
        draw("No entries", 49, y, 9, regular, muted);
        y -= 18;
      }
      for (const row of table.rows) {
        const cells = cellLines(row),
          depth = Math.max(1, ...cells.map((l) => l.length));
        for (let n = 0; n < depth; n++) {
          if (y < 77) {
            freshPage();
            title();
          }
          cells.forEach((lines, i) => {
            if (lines[n]) draw(lines[n], 49 + i * cellWidth, y, size);
          });
          y -= leading;
        }
        y -= 3;
        rule(y + 5, pale);
        y -= 4;
      }
      y -= 15;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    // Footer line in pale gray
    p.drawLine({
      start: { x: 46, y: 50 },
      end: { x: 549, y: 50 },
      thickness: 0.7,
      color: pale,
    });
    draw("I Shree Enterprise  |  " + documentId, 46, 34, 8, regular, muted);
    draw(i + 1 + " / " + pages.length, 549, 34, 8, regular, muted, true);
  });
  return pdf.save();
}
