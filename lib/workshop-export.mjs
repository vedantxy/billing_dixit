// Neutralise formulas when a register is opened in a spreadsheet.
export function reportCsv(tables) {
  const cell = (value) => {
    const text = String(value ?? "");
    const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    tables
      .flatMap((t) => [[t.title], t.headers, ...t.rows, []])
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
