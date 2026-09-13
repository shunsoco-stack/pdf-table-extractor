import { test, expect, type Page, type Download } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const project = process.cwd();
const demos = path.join(project, "public", "demos");
const fixtures = path.join(project, "tests", "fixtures");
const pageErrors = new WeakMap<Page, string[]>();
const cell = (page: Page, address: string) =>
  page.getByRole("textbox", { name: new RegExp(`^${address}(?: 要確認)?$`) });
const choices = (page: Page) => page.locator(".table-choice");
const gridRows = (page: Page) =>
  page.getByRole("table", { name: "抽出結果の編集" }).locator("tbody tr");

async function pdfHasRendered(page: Page) {
  const canvas = page.locator(".pdf-paper canvas");
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(
      async () =>
        canvas.evaluate((element) => {
          const target = element as HTMLCanvasElement;
          if (target.width < 500 || target.height < 500) return 0;
          const context = target.getContext("2d");
          if (!context) return 0;
          const data = context.getImageData(
            0,
            0,
            target.width,
            target.height,
          ).data;
          let ink = 0;
          for (let index = 0; index < data.length; index += 64) {
            if (
              data[index + 3] > 0 &&
              Math.min(data[index], data[index + 1], data[index + 2]) < 220
            )
              ink += 1;
          }
          return ink;
        }),
      { message: "PDF canvas must contain rendered text/table pixels" },
    )
    .toBeGreaterThan(100);
}

async function openPdf(page: Page, name: string, tableCount: number) {
  await page
    .getByTestId("pdf-input")
    .setInputFiles(path.join(demos, `${name}.pdf`));
  await expect(choices(page)).toHaveCount(tableCount);
  await expect(page.locator(".document-workspace")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await pdfHasRendered(page);
}

async function screenshot(page: Page, name: string) {
  if (process.env.CAPTURE_SCREENSHOTS !== "1") return;
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map(async (image) => {
        await image.decode();
        if (!image.complete || image.naturalWidth === 0)
          throw new Error(`Image did not load: ${image.src}`);
      }),
    );
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  if (await page.locator(".pdf-paper canvas").count())
    await pdfHasRendered(page);
  const directory = path.join(project, "docs", "screenshots");
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, name),
    fullPage: true,
    animations: "disabled",
  });
}

async function downloadBytes(download: Download): Promise<Buffer> {
  expect(await download.failure()).toBeNull();
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  return readFile(downloadPath!);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "PDF表データ抽出・CSV変換ツール",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("pdf-input")).toBeEnabled();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? [], "No uncaught browser exceptions").toEqual(
    [],
  );
});

test("real Japanese PDF → edit → row/column undo → reviewed CSV download", async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method()))
      uploads.push(`${request.method()} ${request.url()}`);
  });
  await expect(
    page.getByRole("region", { name: "PDFアップロード" }),
  ).toBeVisible();
  await expect(
    page.getByText("スキャンPDF・OCRには未対応", { exact: true }),
  ).toBeVisible();
  await screenshot(page, "01-pdf-upload.png");
  await openPdf(page, "invoice", 1);
  await expect(gridRows(page)).toHaveCount(9);
  await expect(cell(page, "A1")).toHaveValue("日付");
  await expect(cell(page, "B2")).toHaveValue("コピー用紙 A4");
  await expect(cell(page, "E2")).toHaveValue("5,760");
  await expect(cell(page, "F3")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "見出し行" })).toHaveValue(
    "0",
  );
  await expect(page.locator(".table-outline")).toBeVisible();
  await screenshot(page, "02-pdf-table-preview.png");

  await cell(page, "A2").fill("09/15 修正済み");
  await expect(page.locator(".formula-bar")).toContainText("09/15 修正済み");
  await screenshot(page, "03-table-edit.png");
  await page.getByRole("combobox", { name: "見出し行" }).selectOption("1");
  await expect(gridRows(page).nth(1)).toHaveClass(/header-row/u);
  await page.getByRole("combobox", { name: "見出し行" }).selectOption("none");
  await expect(page.locator("tr.header-row")).toHaveCount(0);
  await page.getByRole("combobox", { name: "見出し行" }).selectOption("0");

  await cell(page, "A3").click();
  await page.getByRole("button", { name: "選択行を削除", exact: true }).click();
  await expect(gridRows(page)).toHaveCount(8);
  await expect(cell(page, "B3")).toHaveValue("ノート A5");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(gridRows(page)).toHaveCount(9);
  await expect(cell(page, "B3")).toHaveValue("ボールペン 黒");
  await cell(page, "F2").click();
  await page.getByRole("button", { name: "選択列を削除", exact: true }).click();
  await expect(gridRows(page).first().locator("td")).toHaveCount(5);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(gridRows(page).first().locator("td")).toHaveCount(6);
  await expect(cell(page, "F2")).toHaveValue("通常納品");
  await expect(cell(page, "A2")).toHaveValue("09/15 修正済み");

  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "データをダウンロード" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CSVをダウンロード", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "出力ファイル名" })
    .fill("請求明細_確認済み");
  await page
    .getByRole("checkbox", { name: "元のPDFと抽出内容を確認しました" })
    .check();
  await screenshot(page, "05-export.png");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "CSVをダウンロード", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("請求明細_確認済み.csv");
  const bytes = await downloadBytes(download);
  expect(Array.from(bytes.subarray(0, 3))).toEqual([239, 187, 191]);
  const csv = bytes.toString("utf8");
  expect(csv).toContain("日付,品目,数量,単価,金額,備考\r\n");
  expect(csv).toContain(
    '09/15 修正済み,コピー用紙 A4,12,480,"5,760",通常納品\r\n',
  );
  expect(csv).toContain('09/02,ボールペン 黒,30,150,"4,500",\r\n');
  expect(csv.split("\r\n")).toHaveLength(10);
  expect(
    uploads,
    "PDF upload/edit/export must never send document data to a server",
  ).toEqual([]);
});

test("multi-page sales PDF exposes both tables and synchronizes page selection", async ({
  page,
}) => {
  await openPdf(page, "sales", 2);
  await expect(gridRows(page)).toHaveCount(7);
  await expect(cell(page, "A2")).toHaveValue("09/01");
  await expect(
    page.getByRole("button", { name: "前のページ", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "次のページ", exact: true }).click();
  await expect(page.locator(".pager")).toContainText("2 / 2");
  await pdfHasRendered(page);
  await expect(page.locator(".table-outline")).toHaveCount(0);
  await choices(page).nth(1).click();
  await expect(choices(page).nth(1)).toHaveClass(/selected/u);
  await expect(cell(page, "A2")).toHaveValue("09/09");
  await expect(cell(page, "B5")).toHaveValue("ひだまり研究所");
  await expect(page.locator(".table-outline")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "次のページ", exact: true }),
  ).toBeDisabled();
  await choices(page).first().click();
  await expect(page.locator(".pager")).toContainText("1 / 2");
  await expect(cell(page, "A2")).toHaveValue("09/01");
});

test("same-page product tables preserve empty cells and export every sheet to XLSX", async ({
  page,
}) => {
  await page.getByRole("button", { name: /商品一覧.*複数表/u }).click();
  await expect(choices(page)).toHaveCount(2);
  await pdfHasRendered(page);
  await expect(gridRows(page)).toHaveCount(5);
  await expect(cell(page, "A2")).toHaveValue("00101");
  await expect(cell(page, "D4")).toHaveValue("");
  await expect(cell(page, "D4")).toHaveAccessibleName("D4 要確認");
  await expect(page.locator(".table-feedback")).toContainText("セルを要確認");
  await screenshot(page, "04-multiple-tables.png");
  await choices(page).nth(1).click();
  await expect(page.locator(".pager")).toContainText("1 / 1");
  await expect(cell(page, "A2")).toHaveValue("00201");
  await expect(cell(page, "B2")).toHaveValue("収納ボックス");
  await expect(cell(page, "D5")).toHaveValue("");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  await page.getByRole("button", { name: /Excel.*xlsx/u }).click();
  await page.getByRole("checkbox", { name: /すべての表を出力する/u }).check();
  await expect(page.locator(".export-summary")).toContainText("2件の表");
  await page
    .getByRole("checkbox", { name: "元のPDFと抽出内容を確認しました" })
    .check();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "XLSXをダウンロード", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/u);
  const bytes = await downloadBytes(download);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  expect(workbook.worksheets).toHaveLength(2);
  const [stationery, desk] = workbook.worksheets;
  expect(stationery.rowCount).toBe(5);
  expect(stationery.columnCount).toBe(5);
  expect(stationery.getCell("A2").value).toBe("00101");
  expect(stationery.getCell("B2").value).toBe("ノート A5");
  expect(stationery.getCell("D4").value).toBe("");
  expect(desk.getCell("A2").value).toBe("00201");
  expect(desk.getCell("B2").value).toBe("収納ボックス");
  expect(desk.getCell("D5").value).toBe("");
});

test("blank, prose-only and invalid documents give actionable feedback", async ({
  page,
}) => {
  await page
    .getByTestId("pdf-input")
    .setInputFiles(path.join(fixtures, "blank.pdf"));
  await expect(
    page.getByRole("heading", {
      name: "表候補が見つかりませんでした",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/1ページ目には抽出できる文字がありません/u),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ダウンロード", exact: true }),
  ).toBeDisabled();
  await page
    .getByTestId("pdf-input")
    .setInputFiles(path.join(fixtures, "non-table.pdf"));
  await expect(page.locator(".file-summary")).toContainText("non-table.pdf");
  await expect(choices(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "表候補が見つかりませんでした",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByTestId("pdf-input")
    .setInputFiles({
      name: "invalid.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("This file is not a PDF"),
    });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "有効なPDFファイルではありません",
  );
  await expect(page.getByTestId("pdf-input")).toBeEnabled();
  await page
    .getByTestId("pdf-input")
    .setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not PDF"),
    });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "PDFファイルを選択してください",
  );
});

test("mobile workflow keeps the document within the viewport and switches source/table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noBodyOverflow = async () => {
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, "Body must not scroll horizontally").toBeLessThanOrEqual(
      1,
    );
  };
  await noBodyOverflow();
  await openPdf(page, "invoice", 1);
  await expect(page.locator(".editor-panel")).toBeVisible();
  await expect(page.locator(".viewer-panel")).toBeHidden();
  await cell(page, "B2").fill("モバイルで編集");
  await expect(cell(page, "B2")).toHaveValue("モバイルで編集");
  await noBodyOverflow();
  await page.getByRole("button", { name: "元のPDF", exact: true }).click();
  await expect(page.locator(".viewer-panel")).toBeVisible();
  await expect(page.locator(".editor-panel")).toBeHidden();
  await pdfHasRendered(page);
  await noBodyOverflow();
  await page.getByRole("button", { name: "抽出テーブル", exact: true }).click();
  await expect(cell(page, "B2")).toHaveValue("モバイルで編集");
  await page.getByRole("button", { name: "ダウンロード", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "データをダウンロード" }),
  ).toBeVisible();
  await noBodyOverflow();
  await page
    .getByRole("button", { name: "出力画面を閉じる", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "データをダウンロード" }),
  ).toBeHidden();
});
