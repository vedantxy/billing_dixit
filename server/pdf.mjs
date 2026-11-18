import "regenerator-runtime/runtime.js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { invoiceNumber, money, niceDate, statuses } from "../lib/billing.mjs";

const ink = rgb(0.12, 0.13, 0.17),
  muted = rgb(0.36, 0.38, 0.42),
  purple = rgb(0.06, 0.34, 0.28);
const pale = rgb(0.84, 0.89, 0.86);
export const invoicePdf = (invoice, loadFont) =>
  documentPdf(invoice, invoice.workshopAnnex, loadFont);
export const workshopPdf = (statement, loadFont) =>
  documentPdf(null, statement, loadFont);
async function documentPdf(inv, statement, loadFont) {
  const business = inv?.seller ||
    statement?.profile || { name: "Billfold Workshop" };
  const documentId = inv ? invoiceNumber(inv.sequence) : statement.month;
  let runningTitle = inv ? "Invoice" : "Workshop statement";
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(documentId + " — " + business.name);
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
  const rule = (yy) =>
    page.drawLine({
      start: { x: 46, y: yy },
      end: { x: 549, y: yy },
      thickness: 0.7,
      color: pale,
    });
  function freshPage() {
    page = pdf.addPage([595, 842]);
    y = 780;
    draw(runningTitle, 46, y, 14, bold, purple);
    draw(documentId, 549, y, 12, bold, ink, true);
    rule(y - 17);
    y -= 45;
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
    for (const line of wrap(business.name, 495, 20, bold)) {
      draw(line, 46, y, 20, bold);
      y -= 25;
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
    y -= 24;
    draw(
      statuses[inv.status] + "  ·  " + niceDate(inv.issuedOn, true),
      46,
      y,
      11,
      regular,
      muted,
    );
    y -= 34;
    draw("BILL TO", 46, y, 9, bold, muted);
    draw("DUE DATE", 549, y, 9, bold, muted, true);
    y -= 18;
    draw(niceDate(inv.dueOn, true), 549, y, 11, regular, ink, true);
    for (const line of wrap(inv.billTo, 340, 12, bold)) {
      draw(line, 46, y, 12, bold);
      y -= 17;
    }
    for (const line of [
      ...wrap(inv.billEmail, 350),
      ...wrap(inv.billAddress, 400),
    ]) {
      draw(line, 46, y, 10, regular, muted);
      y -= 14;
    }
    y -= 16;
    function tableHead() {
      draw("Description", 46, y, 10, bold);
      draw("Qty", 353, y, 10, bold, ink, true);
      draw("Unit price", 447, y, 10, bold, ink, true);
      draw("Amount", 549, y, 10, bold, ink, true);
      y -= 9;
      rule(y);
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
    rule(y);
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
        strong ? purple : ink,
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
      : "Workshop statement";
    freshPage();
    for (const line of wrap(business.name, 500, 20, bold)) {
      draw(line, 46, y, 20, bold);
      y -= 25;
    }
    draw("Accounting month  /  " + statement.month, 46, y, 11, regular, muted);
    y -= 34;
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
          color: rgb(0.91, 0.95, 0.92),
        });
        lines.forEach((lines, i) =>
          lines.forEach((line, n) =>
            draw(line, 49 + i * cellWidth, y - n * leading, size, bold, purple),
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
        rule(y + 5);
        y -= 4;
      }
      y -= 15;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    rule(50);
    draw("Billfold Workshop  /  " + documentId, 46, 34, 8, regular, muted);
    draw(i + 1 + " / " + pages.length, 549, 34, 8, regular, muted, true);
  });
  return pdf.save();
}
