import type { ExtractedTable } from "./types";

/** Put the selected header first without silently dropping any other row. */
export function exportRows(table: ExtractedTable): string[][] {
  const rows = table.rows.map((row) => row.map((cell) => cell.text));
  const header = table.headerRow;
  if (
    header !== null &&
    Number.isInteger(header) &&
    header > 0 &&
    header < rows.length
  ) {
    rows.unshift(...rows.splice(header, 1));
  }
  return rows;
}

/** CSV has no cell type: prefix formula-like values before escaping the field. */
export function safeCsvValue(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** UTF-8 BOM helps Japanese CSV open correctly in spreadsheet applications. */
export function createCsv(table: ExtractedTable): string {
  const lines = exportRows(table).map((row) => row.map(safeCsvValue).join(","));
  return `\uFEFF${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`;
}

function sheetName(name: string, index: number, used: Set<string>): string {
  const base =
    name
      .replace(/[\\/*?:[\]]/gu, " ")
      .replace(/^'+|'+$/gu, "")
      .trim() || `表${index + 1}`;
  let result = base.slice(0, 31);
  let sequence = 2;
  while (used.has(result.toLocaleLowerCase())) {
    const suffix = ` (${sequence++})`;
    result = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(result.toLocaleLowerCase());
  return result;
}

/** All XLSX values are explicit text, preserving Japanese, leading zeros and literal formulas. */
export async function createXlsx(
  tables: ExtractedTable[],
): Promise<Uint8Array> {
  if (tables.length === 0) throw new Error("出力する表を選択してください。");
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PDF表データ抽出・CSV変換ツール";
  workbook.created = new Date();
  const names = new Set<string>();

  for (const [index, table] of tables.entries()) {
    const rows = exportRows(table);
    const sheet = workbook.addWorksheet(sheetName(table.name, index, names));
    const hasHeader =
      table.headerRow !== null &&
      Number.isInteger(table.headerRow) &&
      table.headerRow >= 0 &&
      table.headerRow < rows.length;
    sheet.addRows(rows);
    sheet.properties.defaultRowHeight = 23;
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.numFmt = "@";
        cell.font = {
          name: "Yu Gothic",
          size: 10,
          color: { argb: "FF243329" },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    });

    if (hasHeader) {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.getRow(1).height = 29;
      sheet.getRow(1).eachCell((cell) => {
        cell.font = {
          name: "Yu Gothic",
          size: 10,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF28745D" },
        };
      });
      const columns = Math.max(0, ...rows.map((row) => row.length));
      if (columns > 0)
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: columns },
        };
    }

    sheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        for (const line of String(cell.value ?? "").split(/\r?\n/u)) {
          const visualLength = Array.from(line).reduce(
            (sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1),
            0,
          );
          width = Math.max(width, visualLength + 3);
        }
      });
      column.width = Math.min(48, width);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
