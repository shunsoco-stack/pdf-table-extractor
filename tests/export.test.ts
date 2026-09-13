import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createCsv, createXlsx, exportRows } from "../src/lib/export";
import type { ExtractedTable } from "../src/lib/types";

function table(
  values: string[][],
  overrides: Partial<ExtractedTable> = {},
): ExtractedTable {
  return {
    id: "test",
    page: 1,
    name: "商品一覧",
    rows: values.map((row) => row.map((text) => ({ text }))),
    headerRow: 0,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    notes: [],
    ...overrides,
  };
}

describe("CSV export", () => {
  it("preserves Japanese, empty cells, quoting and CRLF with a UTF-8 BOM", () => {
    const csv = createCsv(
      table([
        ["商品", "コード", "備考"],
        ["ノート", "00123", ""],
        ['A社, "担当"', "複数\n行", "日本語"],
      ]),
    );
    expect(csv).toBe(
      '\uFEFF商品,コード,備考\r\nノート,00123,\r\n"A社, ""担当""","複数\n行",日本語\r\n',
    );
    const bytes = new TextEncoder().encode(csv);
    expect(Array.from(bytes.slice(0, 3))).toEqual([239, 187, 191]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(
      csv,
    );
  });

  it("neutralizes spreadsheet formulas including whitespace prefixes", () => {
    expect(
      createCsv(
        table([["=1+1", "+123", "-5", "@SUM(A1)", "  =1", "\t=1", "通常"]], {
          headerRow: null,
        }),
      ),
    ).toBe("\uFEFF'=1+1,'+123,'-5,'@SUM(A1),'  =1,'\t=1,通常\r\n");
  });

  it("moves the chosen header first and preserves every other row", () => {
    const source = table([["前の行"], ["見出し"], ["明細"]], { headerRow: 1 });
    expect(exportRows(source)).toEqual([["見出し"], ["前の行"], ["明細"]]);
    expect(source.rows[0][0].text).toBe("前の行");
    expect(exportRows({ ...source, headerRow: null })).toEqual([
      ["前の行"],
      ["見出し"],
      ["明細"],
    ]);
  });
});

describe("XLSX export", () => {
  it("round-trips Japanese, zeros, empty cells, newline and literal formula values", async () => {
    const input = table([
      ["品名", "コード", "備考", "文字列"],
      ["日本語ノート", "00123", "", "=1+1"],
      ["鉛筆", "00000", "二行\nコメント", "+120"],
    ]);
    const bytes = await createXlsx([input]);
    expect(Array.from(bytes.slice(0, 2))).toEqual([80, 75]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("商品一覧");
    expect(sheet.getCell("A2").value).toBe("日本語ノート");
    expect(sheet.getCell("B2").value).toBe("00123");
    expect(sheet.getCell("C2").value).toBe("");
    expect(sheet.getCell("C3").value).toBe("二行\nコメント");
    expect(sheet.getCell("D2").value).toBe("=1+1");
    expect(sheet.getCell("D2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("exports several tables with valid, unique sheet names and honors header selection", async () => {
    const values = [["明細"], ["見出し"]];
    const bytes = await createXlsx([
      table(values, { name: "売上/一覧", headerRow: 1 }),
      table(values, { name: "売上/一覧", headerRow: null }),
      table(values, { name: "x".repeat(40), headerRow: 0 }),
      table(values, { name: "x".repeat(40), headerRow: 0 }),
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "売上 一覧",
      "売上 一覧 (2)",
      "x".repeat(31),
      `${"x".repeat(27)} (2)`,
    ]);
    expect(workbook.worksheets[0].getCell("A1").value).toBe("見出し");
    expect(workbook.worksheets[0].getCell("A2").value).toBe("明細");
    expect(
      workbook.worksheets[1].views?.some((view) => view.state === "frozen") ??
        false,
    ).toBe(false);
  });

  it("rejects an empty selection", async () => {
    await expect(createXlsx([])).rejects.toThrow(
      "出力する表を選択してください",
    );
  });
});
