import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractDocument } from "../src/lib/extract";

async function extractFixture(relativePath: string) {
  const task = getDocument({
    data: new Uint8Array(await readFile(path.resolve(relativePath))),
    standardFontDataUrl:
      path
        .resolve("node_modules/pdfjs-dist/standard_fonts")
        .replaceAll("\\", "/") + "/",
    cMapUrl:
      path.resolve("node_modules/pdfjs-dist/cmaps").replaceAll("\\", "/") + "/",
    cMapPacked: true,
    wasmUrl:
      path.resolve("node_modules/pdfjs-dist/wasm").replaceAll("\\", "/") + "/",
  });
  try {
    return await extractDocument(await task.promise);
  } finally {
    await task.destroy();
  }
}

describe("real PDF.js extraction with Japanese PDF fixtures", () => {
  it("extracts a 1-page invoice, retaining Japanese text, numeric alignment and blank notes", async () => {
    const result = await extractFixture("public/demos/invoice.pdf");
    expect(result.pageCount).toBe(1);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].rows).toHaveLength(9);
    expect(result.tables[0].rows.every((row) => row.length === 6)).toBe(true);
    expect(result.tables[0].rows[0].map((cell) => cell.text)).toEqual([
      "日付",
      "品目",
      "数量",
      "単価",
      "金額",
      "備考",
    ]);
    expect(result.tables[0].rows[1].map((cell) => cell.text)).toEqual([
      "09/01",
      "コピー用紙 A4",
      "12",
      "480",
      "5,760",
      "通常納品",
    ]);
    expect(result.tables[0].rows[2][5].text).toBe("");
    expect(result.tables[0].headerRow).toBe(0);
  });

  it("extracts each page of a 2-page sales PDF with the original page references", async () => {
    const result = await extractFixture("public/demos/sales.pdf");
    expect(result.pageCount).toBe(2);
    expect(result.tables).toHaveLength(2);
    expect(result.tables.map((table) => table.page)).toEqual([1, 2]);
    expect(
      result.tables.every(
        (table) =>
          table.rows.length === 7 &&
          table.rows.every((row) => row.length === 5),
      ),
    ).toBe(true);
    expect(result.tables[1].rows[6].map((cell) => cell.text)).toEqual([
      "09/16",
      "つばめ企画",
      "封筒 長形3号",
      "100",
      "8,000",
    ]);
  });

  it("detects two tables on one page and retains internal empty cells and leading zeroes", async () => {
    const result = await extractFixture("public/demos/products.pdf");
    expect(result.tables).toHaveLength(2);
    expect(
      result.tables.every(
        (table) =>
          table.rows.length === 5 &&
          table.rows.every((row) => row.length === 5),
      ),
    ).toBe(true);
    expect(result.tables[0].rows[1][0].text).toBe("00101");
    expect(result.tables[0].rows[3].map((cell) => cell.text)).toEqual([
      "00103",
      "クリアファイル",
      "90",
      "",
      "入荷待ち",
    ]);
    expect(result.tables[1].rows[4].map((cell) => cell.text)).toEqual([
      "00204",
      "ペンスタンド",
      "640",
      "",
      "入荷待ち",
    ]);
  });

  it("reports an empty page without claiming it was extracted", async () => {
    const result = await extractFixture("tests/fixtures/blank.pdf");
    expect(result.tables).toEqual([]);
    expect(result.emptyPages).toEqual([1]);
  });

  it("does not convert ordinary Japanese paragraphs into a table", async () => {
    const result = await extractFixture("tests/fixtures/non-table.pdf");
    expect(result.tables).toEqual([]);
    expect(result.emptyPages).toEqual([]);
  });
});
