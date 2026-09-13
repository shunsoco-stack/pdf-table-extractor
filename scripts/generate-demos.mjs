import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// Reproducible fictional fixtures. All PDF cells use selectable text with an
// embedded open Japanese font. Source font is cached locally, never served.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public/demos");
const fixtureOutput = path.join(root, "tests/fixtures");
const temporary = path.join(root, "tmp/pdfs");
await Promise.all(
  [output, fixtureOutput, temporary].map((dir) =>
    mkdir(dir, { recursive: true }),
  ),
);
const fontPath = path.join(temporary, "BIZUDGothic-Regular.ttf");
try {
  await access(fontPath);
} catch {
  const response = await fetch(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/bizudgothic/BIZUDGothic-Regular.ttf",
  );
  if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
  await writeFile(fontPath, new Uint8Array(await response.arrayBuffer()));
}
const licensePath = path.join(output, "FONT-LICENSE.txt");
try {
  await access(licensePath);
} catch {
  const response = await fetch(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/bizudgothic/OFL.txt",
  );
  if (!response.ok)
    throw new Error(`Font license download failed: ${response.status}`);
  await writeFile(licensePath, await response.text());
}
const fontBytes = await readFile(fontPath);
const colors = {
  ink: rgb(0.14, 0.19, 0.17),
  muted: rgb(0.43, 0.48, 0.45),
  green: rgb(0.14, 0.4, 0.31),
  line: rgb(0.82, 0.85, 0.83),
  light: rgb(0.94, 0.96, 0.94),
  white: rgb(1, 1, 1),
};
const pageSize = [595.28, 841.89];
const margin = 44;
const width = pageSize[0] - margin * 2;

async function document(title) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setAuthor("PDF表データ抽出・CSV変換ツール / 架空データ");
  pdf.setSubject(
    "デモ・テスト用の架空データ。実在の企業や取引とは関係ありません。",
  );
  pdf.setCreator("PDF表データ抽出・CSV変換ツール");
  pdf.setCreationDate(new Date("2026-09-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-09-01T00:00:00Z"));
  // Full embedding avoids fontkit subset glyph loss in Japanese TrueType fonts.
  const font = await pdf.embedFont(fontBytes, { subset: false });
  return { pdf, font };
}

function label(page, font, value, x, y, size = 10, color = colors.ink) {
  page.drawText(value, { x, y, size, font, color });
}

function chrome(page, font, title, subtitle, number, total) {
  page.drawRectangle({
    x: margin,
    y: 785,
    width: 23,
    height: 4,
    color: colors.green,
  });
  label(page, font, "SAMPLE DOCUMENT", margin, 761, 8, colors.green);
  label(page, font, title, margin, 720, 25);
  label(page, font, subtitle, margin, 695, 9, colors.muted);
  page.drawLine({
    start: { x: margin, y: 76 },
    end: { x: margin + width, y: 76 },
    thickness: 0.65,
    color: colors.line,
  });
  label(
    page,
    font,
    "デモ用の架空データです。実在の企業・商品・取引とは関係ありません。",
    margin,
    56,
    8,
    colors.muted,
  );
  const pagination = `${number} / ${total}`;
  label(
    page,
    font,
    pagination,
    margin + width - font.widthOfTextAtSize(pagination, 8),
    56,
    8,
    colors.muted,
  );
}

function table(
  page,
  font,
  headers,
  rows,
  top,
  columnWidths,
  rightColumns = [],
  rowHeight = 34,
) {
  const bottom = top - rowHeight * (rows.length + 1);
  page.drawRectangle({
    x: margin,
    y: top - rowHeight,
    width,
    height: rowHeight,
    color: colors.green,
  });
  rows.forEach((_, index) => {
    if (index % 2 === 1)
      page.drawRectangle({
        x: margin,
        y: top - rowHeight * (index + 2),
        width,
        height: rowHeight,
        color: colors.light,
      });
  });
  const allRows = [headers, ...rows];
  for (let row = 0; row < allRows.length; row += 1) {
    let x = margin;
    for (let column = 0; column < headers.length; column += 1) {
      const value = allRows[row][column] ?? "";
      const size = row === 0 ? 9 : 9.1;
      const textWidth = font.widthOfTextAtSize(value, size);
      if (textWidth > columnWidths[column] - 16)
        throw new Error(`Cell is too wide: ${value}`);
      const textX =
        row > 0 && rightColumns.includes(column)
          ? x + columnWidths[column] - 8 - textWidth
          : x + 8;
      if (value)
        label(
          page,
          font,
          value,
          textX,
          top - rowHeight * row - rowHeight / 2 - 3.4,
          size,
          row === 0 ? colors.white : colors.ink,
        );
      x += columnWidths[column];
    }
  }
  for (let row = 1; row <= allRows.length; row += 1) {
    const y = top - rowHeight * row;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + width, y },
      thickness: 0.5,
      color: colors.line,
    });
  }
  let x = margin;
  for (let column = 0; column <= columnWidths.length; column += 1) {
    page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      thickness: 0.4,
      color: colors.line,
    });
    x += columnWidths[column] ?? 0;
  }
  return bottom;
}

async function save(pdf, name, directory = output) {
  const bytes = await pdf.save({ useObjectStreams: false });
  await writeFile(path.join(directory, name), bytes);
  process.stdout.write(
    `${name}: ${pdf.getPageCount()} page(s), ${bytes.length} bytes\n`,
  );
}

const invoiceRows = [
  ["09/01", "コピー用紙 A4", "12", "480", "5,760", "通常納品"],
  ["09/02", "ボールペン 黒", "30", "150", "4,500", ""],
  ["09/03", "ノート A5", "24", "320", "7,680", ""],
  ["09/04", "クリアファイル", "50", "90", "4,500", "追加発注"],
  ["09/05", "デスクマット", "8", "1,800", "14,400", ""],
  ["09/08", "ふせんセット", "20", "280", "5,600", ""],
  ["09/09", "収納ボックス", "6", "1,200", "7,200", "倉庫用"],
  ["09/10", "書類トレー", "10", "850", "8,500", ""],
];
{
  const { pdf, font } = await document("請求明細 / 2026年9月");
  const page = pdf.addPage(pageSize);
  chrome(
    page,
    font,
    "請求明細書",
    "2026年9月分  /  請求番号 INV-2026-0901",
    1,
    1,
  );
  label(page, font, "青葉デザイン株式会社 御中", margin, 652, 12);
  label(
    page,
    font,
    "発行元：こもれび文具株式会社（架空）",
    margin,
    629,
    9,
    colors.muted,
  );
  table(
    page,
    font,
    ["日付", "品目", "数量", "単価", "金額", "備考"],
    invoiceRows,
    590,
    [56, 155, 40, 70, 80, 106.28],
    [2, 3, 4],
  );
  label(
    page,
    font,
    "金額はすべて税抜・円表示です。",
    margin,
    253,
    9,
    colors.muted,
  );
  label(page, font, "小計  58,140 円", margin, 222, 12, colors.green);
  label(
    page,
    font,
    "この PDF の表をアップロードすると、明細を抽出・編集できます。",
    margin,
    168,
    9,
    colors.muted,
  );
  await save(pdf, "invoice.pdf");
}

const salesPages = [
  [
    ["09/01", "青葉デザイン", "ノート A5", "24", "7,680"],
    ["09/02", "みなと商事", "コピー用紙 A4", "40", "19,200"],
    ["09/03", "つばめ企画", "ペンセット", "18", "9,720"],
    ["09/04", "青葉デザイン", "収納ボックス", "6", "7,200"],
    ["09/05", "森の書房", "しおりセット", "60", "12,000"],
    ["09/08", "みなと商事", "デスクマット", "12", "21,600"],
  ],
  [
    ["09/09", "つばめ企画", "クリアファイル", "50", "4,500"],
    ["09/10", "森の書房", "ノート B6", "36", "9,360"],
    ["09/11", "青葉デザイン", "ボールペン 黒", "30", "4,500"],
    ["09/12", "ひだまり研究所", "書類トレー", "15", "12,750"],
    ["09/15", "みなと商事", "ふせんセット", "48", "13,440"],
    ["09/16", "つばめ企画", "封筒 長形3号", "100", "8,000"],
  ],
];
{
  const { pdf, font } = await document("売上一覧 / 2ページ");
  salesPages.forEach((rows, index) => {
    const page = pdf.addPage(pageSize);
    chrome(
      page,
      font,
      "売上一覧",
      `2026年9月  /  こもれび文具株式会社（架空）  /  ${index === 0 ? "前半" : "後半"}`,
      index + 1,
      2,
    );
    label(
      page,
      font,
      `${index === 0 ? "9月1日 - 9月8日" : "9月9日 - 9月16日"} の売上明細`,
      margin,
      646,
      11,
    );
    table(
      page,
      font,
      ["売上日", "取引先", "商品", "数量", "売上金額"],
      rows,
      610,
      [60, 150, 153, 54, 90.28],
      [3, 4],
      39,
    );
    label(
      page,
      font,
      "金額はすべて税抜・円表示です。ページごとに同じ列構成の表があります。",
      margin,
      296,
      9,
      colors.muted,
    );
  });
  await save(pdf, "sales.pdf");
}

const productTables = [
  {
    title: "01  文具・消耗品",
    rows: [
      ["00101", "ノート A5", "320", "84", "定番"],
      ["00102", "ボールペン 黒", "150", "120", ""],
      ["00103", "クリアファイル", "90", "", "入荷待ち"],
      ["00104", "ふせんセット", "280", "45", "新商品"],
    ],
  },
  {
    title: "02  収納・デスク用品",
    rows: [
      ["00201", "収納ボックス", "1,200", "18", ""],
      ["00202", "デスクマット", "1,800", "8", "残りわずか"],
      ["00203", "書類トレー", "850", "32", "定番"],
      ["00204", "ペンスタンド", "640", "", "入荷待ち"],
    ],
  },
];
{
  const { pdf, font } = await document("商品一覧 / 複数表・空セル");
  const page = pdf.addPage(pageSize);
  chrome(
    page,
    font,
    "商品一覧",
    "2026年9月1日現在  /  こもれび文具株式会社（架空）",
    1,
    1,
  );
  productTables.forEach((item, index) => {
    const top = index === 0 ? 615 : 357;
    label(page, font, item.title, margin, top + 22, 12, colors.green);
    table(
      page,
      font,
      ["商品コード", "商品名", "単価", "在庫数", "備考"],
      item.rows,
      top,
      [83, 170, 73, 65, 116.28],
      [2, 3],
    );
  });
  label(
    page,
    font,
    "空欄の在庫数は未確定です。商品コードの先頭の 0 も確認できます。",
    margin,
    141,
    9,
    colors.muted,
  );
  await save(pdf, "products.pdf");
}

{
  const pdf = await PDFDocument.create();
  pdf.setTitle("空白 PDF / テスト用");
  pdf.addPage(pageSize);
  await save(pdf, "blank.pdf", fixtureOutput);
}

{
  const { pdf, font } = await document("文章のみの PDF / テスト用");
  const page = pdf.addPage(pageSize);
  chrome(page, font, "お知らせ", "表が含まれない PDF のテスト資料", 1, 1);
  [
    "いつもご利用いただきありがとうございます。",
    "この文書は、通常の文章だけを含むテスト用の資料です。",
    "表形式のデータは記載されていません。",
    "空の抽出結果が適切に案内されることを確認できます。",
  ].forEach((line, index) =>
    label(page, font, line, margin, 641 - index * 24, 10),
  );
  await save(pdf, "non-table.pdf", fixtureOutput);
}
