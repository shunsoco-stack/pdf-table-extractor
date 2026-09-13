import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  detectTables,
  extractDocument,
  type TextFragment,
} from "../src/lib/extract";

const piece = (
  text: string,
  x: number,
  y: number,
  width = text.length * 10,
): TextFragment => ({ text, x, y, width, height: 10 });
const text = (tables: ReturnType<typeof detectTables>) =>
  tables.map((table) => table.rows.map((row) => row.map((cell) => cell.text)));

function sample(y = 100): TextFragment[] {
  return [
    piece("商品名", 50, y),
    piece("数量", 250, y),
    piece("金額", 350, y),
    piece("ノート", 50, y + 25),
    piece("2", 285, y + 25, 5),
    piece("1,200", 405, y + 25, 25),
    piece("ボールペン", 50, y + 50),
    piece("12", 280, y + 50, 10),
    piece("600", 415, y + 50, 15),
  ];
}

describe("detectTables", () => {
  it("extracts Japanese tables with left-aligned headers and right-aligned numbers", () => {
    const tables = detectTables(sample());
    expect(text(tables)).toEqual([
      [
        ["商品名", "数量", "金額"],
        ["ノート", "2", "1,200"],
        ["ボールペン", "12", "600"],
      ],
    ]);
    expect(tables[0].headerRow).toBe(0);
    expect(tables[0].bounds).toEqual({ x: 44, y: 94, width: 392, height: 72 });
  });

  it("preserves missing cells instead of shifting the remaining values", () => {
    const items = sample();
    items.splice(7, 1);
    const tables = detectTables(items);
    expect(text(tables)[0][2]).toEqual(["ボールペン", "", "600"]);
    expect(tables[0].rows[2][1].warning).toContain("空欄");
  });

  it("separates two tables by a large vertical gap", () => {
    const tables = detectTables([...sample(), ...sample(300)], 2);
    expect(tables).toHaveLength(2);
    expect(tables.map((table) => table.id)).toEqual([
      "page-2-table-1",
      "page-2-table-2",
    ]);
    expect(tables.map((table) => table.page)).toEqual([2, 2]);
  });

  it("separates tables at an intervening caption", () => {
    const tables = detectTables([
      ...sample(),
      piece("消耗品一覧", 70, 177),
      ...sample(202),
    ]);
    expect(tables).toHaveLength(2);
  });

  it("separates side-by-side tables when a clear gutter lies between them", () => {
    const items = [100, 125, 150].flatMap((y, row) => [
      piece(row === 0 ? "商品名" : "ノート", 30, y, 40),
      piece(row === 0 ? "数量" : "2", 100, y, 20),
      piece(row === 0 ? "商品名" : "ペン", 400, y, 40),
      piece(row === 0 ? "数量" : "3", 470, y, 20),
    ]);
    expect(detectTables(items)).toHaveLength(2);
  });

  it("rejoins split Japanese glyphs without inserting spaces", () => {
    const items = sample();
    items.splice(
      3,
      1,
      piece("ノ", 50, 125, 10),
      piece("ー", 60, 125, 10),
      piece("ト", 70, 125, 10),
    );
    expect(text(detectTables(items))[0][1][0]).toBe("ノート");
  });

  it("keeps a sparse row inside an established table", () => {
    const items = sample();
    items.push(
      piece("メモ用紙", 50, 162),
      piece("ノート", 50, 187),
      piece("3", 285, 187, 5),
      piece("900", 415, 187, 15),
    );
    const tables = detectTables(items);
    expect(text(tables)[0][3]).toEqual(["メモ用紙", "", ""]);
  });

  it("flags overlapping text and replacement glyphs with an explicit reason", () => {
    const items = sample();
    items.push(piece("X", 55, 125, 10));
    items[6].text = "不明\ufffd";
    const tables = detectTables(items);
    expect(tables[0].rows[1][0].warning).toContain("重なって");
    expect(tables[0].rows[2][0].warning).toContain("読み取れない");
  });

  it("does not label plain prose or isolated metadata as a table", () => {
    expect(
      detectTables([
        piece("これはテキストのみの文書です。", 50, 100),
        piece("表形式のデータは含まれていません。", 50, 120),
      ]),
    ).toEqual([]);
    expect(
      detectTables([piece("日付", 50, 100), piece("2026/09/14", 200, 100)]),
    ).toEqual([]);
  });

  it("does not invent a header for entirely numeric data", () => {
    const items = [100, 125, 150].flatMap((y) => [
      piece("100", 50, y),
      piece("200", 250, y),
    ]);
    expect(detectTables(items)[0].headerRow).toBeNull();
  });

  it("enforces the per-page text item limit before expensive processing", () => {
    expect(() =>
      detectTables(Array.from({ length: 40_001 }, () => piece("a", 0, 0))),
    ).toThrow("40,000");
  });
});

function pdfWithPages(pages: TextFragment[][]): PDFDocumentProxy {
  return {
    numPages: pages.length,
    getPage: async (number: number) => ({
      getViewport: () => ({
        width: 595,
        height: 842,
        transform: [1, 0, 0, -1, 0, 842],
      }),
      getTextContent: async () => ({
        items: pages[number - 1].map((item) => ({
          str: item.text,
          width: item.width,
          height: item.height,
          transform: [10, 0, 0, 10, item.x, 842 - item.y - item.height],
        })),
      }),
    }),
  } as unknown as PDFDocumentProxy;
}

describe("extractDocument", () => {
  it("extracts every page and reports progress with source page numbers", async () => {
    const onProgress = vi.fn();
    const document = await extractDocument(
      pdfWithPages([sample(), sample()]),
      onProgress,
    );
    expect(document.pageCount).toBe(2);
    expect(document.tables.map((table) => table.page)).toEqual([1, 2]);
    expect(document.tables[0].bounds.y).toBe(94);
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("reports pages with no horizontal text without claiming OCR support", async () => {
    const document = await extractDocument(pdfWithPages([sample(), []]));
    expect(document.emptyPages).toEqual([2]);
  });

  it("rejects PDFs exceeding 100 pages", async () => {
    await expect(
      extractDocument({ numPages: 101 } as PDFDocumentProxy),
    ).rejects.toThrow("100ページ");
  });
});
