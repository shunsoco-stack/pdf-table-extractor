import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Cell, ExtractedDocument, ExtractedTable } from "./types";

/** All coordinates use a PDF.js viewport at scale 1, with a top-left origin. */
export type TextFragment = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Run = TextFragment & { overlap?: boolean };
type TextRow = { y: number; height: number; runs: Run[] };
type Column = { left: number; right: number };

const LIMITS = {
  pageItems: 40_000,
  documentItems: 200_000,
  tables: 200,
  rows: 5_000,
  columns: 100,
};
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const right = (item: TextFragment) => item.x + item.width;
const japanese = /[\u3000-\u9fff\uff00-\uffef]/u;

function appendText(first: string, next: string, gap: number, height: number) {
  if (!first) return next;
  const lastChar = first.at(-1) ?? "";
  const firstChar = next[0] ?? "";
  const separator =
    gap > height * 0.16 && !japanese.test(lastChar) && !japanese.test(firstChar)
      ? " "
      : "";
  return first + separator + next;
}

function makeRows(fragments: TextFragment[]): TextRow[] {
  const sorted = fragments
    .filter(
      (item) =>
        item.text.trim() &&
        [item.x, item.y, item.width, item.height].every(Number.isFinite),
    )
    .map((item) => ({
      ...item,
      text: item.text.replace(/[\r\n\t]/g, " ").trim(),
      height: Math.max(1, item.height),
      width: Math.max(0.1, item.width),
    }))
    .sort((a, b) => a.y + a.height - b.y - b.height || a.x - b.x);
  const groups: TextFragment[][] = [];
  for (const item of sorted) {
    const group = groups.at(-1);
    const baseline = item.y + item.height;
    const previous = group?.[0];
    if (
      previous &&
      Math.abs(baseline - previous.y - previous.height) <=
        Math.max(2, Math.min(previous.height, item.height) * 0.3)
    ) {
      group!.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups.map((group) => {
    group.sort((a, b) => a.x - b.x);
    const runs: Run[] = [];
    for (const item of group) {
      const previous = runs.at(-1);
      const gap = previous ? item.x - right(previous) : Infinity;
      if (
        previous &&
        gap <= Math.max(3, Math.min(previous.height, item.height) * 0.65)
      ) {
        const end = Math.max(right(previous), right(item));
        previous.overlap ||=
          gap < -Math.min(previous.height, item.height) * 0.25;
        previous.text = appendText(previous.text, item.text, gap, item.height);
        previous.width = end - previous.x;
        previous.y = Math.min(previous.y, item.y);
        previous.height = Math.max(previous.height, item.height);
      } else {
        runs.push({ ...item });
      }
    }
    return {
      y: Math.min(...group.map((item) => item.y)),
      height: Math.max(...group.map((item) => item.height)),
      runs,
    };
  });
}

/** Full rows supply ordinal anchors; their combined extents include left labels and right-aligned values. */
function inferColumns(rows: TextRow[]): Column[] {
  const fullest = Math.max(...rows.map((row) => row.runs.length));
  const anchorRows = rows.filter((row) => row.runs.length === fullest);
  const anchors = Array.from({ length: fullest }, (_, index) => ({
    left: Math.min(...anchorRows.map((row) => row.runs[index].x)),
    right: Math.max(...anchorRows.map((row) => right(row.runs[index]))),
  }));
  if (
    anchors.every(
      (column, index) =>
        index === 0 || column.left > anchors[index - 1].right + 2,
    )
  )
    return anchors;
  // If row structures disagree, require whitespace shared by every row instead of inventing boundaries.
  const intervals = rows.flatMap((row) => row.runs).sort((a, b) => a.x - b.x);
  const minimumGap = Math.max(
    3,
    median(intervals.map((item) => item.height)) * 0.55,
  );
  const columns: Column[] = [];
  for (const interval of intervals) {
    const previous = columns.at(-1);
    if (previous && interval.x - previous.right < minimumGap)
      previous.right = Math.max(previous.right, right(interval));
    else columns.push({ left: interval.x, right: right(interval) });
  }
  return columns;
}

function splitRowBands(rows: TextRow[]): TextRow[][] {
  const bands: TextRow[][] = [];
  let current: TextRow[] = [];
  const commit = () => {
    if (current.filter((row) => row.runs.length >= 2).length >= 2)
      bands.push(current);
    current = [];
  };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const previous = current.at(-1);
    const next = rows[index + 1];
    if (previous) {
      const knownGaps = current
        .slice(1)
        .map((entry, gapIndex) => entry.y - current[gapIndex].y);
      const typicalGap = knownGaps.length
        ? median(knownGaps)
        : previous.height * 2.5;
      if (
        row.y - previous.y >
        Math.max(previous.height * 3.5, typicalGap * 1.85)
      )
        commit();
    }
    if (row.runs.length < 2) {
      // A lone caption separates tables. A lone value inside an established table can be an incomplete row.
      const established =
        current.filter((entry) => entry.runs.length >= 2).length >= 2;
      const run = row.runs[0];
      const matchingColumn =
        run &&
        current.some((entry) =>
          entry.runs.some(
            (other) =>
              Math.abs(other.x - run.x) <= 3 ||
              Math.abs(right(other) - right(run)) <= 3,
          ),
        );
      const ordinaryGap =
        previous && row.y - previous.y <= previous.height * 3.3;
      const nextFits =
        next && next.runs.length >= 2 && next.y - row.y <= row.height * 3.3;
      if (established && matchingColumn && ordinaryGap && nextFits)
        current.push(row);
      else commit();
    } else {
      current.push(row);
    }
  }
  commit();
  return bands;
}

function headerCandidate(rows: Cell[][]): number | null {
  const first = rows[0];
  if (!first || first.filter((cell) => cell.text).length < 2) return null;
  const label =
    /^(?:No\.?|ID|日付|年月|月|品名|商品名|商品|品番|商品コード|コード|項目|摘要|内容|数量|単価|金額|合計|税額|税率|備考|売上|売上額|売上金額|売上日|取引先|取引先名|顧客|担当|担当者|区分|カテゴリ|カテゴリー|在庫|在庫数|単位|状態|Name|Date|Description|Qty|Quantity|Price|Amount|Total|Status|Note|Notes)$/i;
  if (first.filter((cell) => label.test(cell.text.trim())).length >= 2)
    return 0;
  const numeric = (text: string) =>
    /^[¥￥$€+\-\d\s,.%()／/年年月日]+$/u.test(text.trim()) && /\d/.test(text);
  const firstNumbers = first.filter((cell) => numeric(cell.text)).length;
  const laterNumbers = rows
    .slice(1, 5)
    .some(
      (row) => row.filter((cell) => numeric(cell.text)).length > firstNumbers,
    );
  return firstNumbers === 0 && laterNumbers ? 0 : null;
}

function toTable(
  rows: TextRow[],
  columns: Column[],
  page: number,
  index: number,
  pageWidth: number,
  pageHeight: number,
): ExtractedTable | null {
  if (columns.length < 2) return null;
  if (columns.length > LIMITS.columns || rows.length > LIMITS.rows)
    throw new Error(
      "表が大きすぎます。1表あたり100列・5,000行以下に分割してください。",
    );
  const active = rows.filter((row) => row.runs.length);
  const repeatsTwoAlignments = (row: TextRow) =>
    row.runs.filter((run) =>
      active.some(
        (otherRow) =>
          otherRow !== row &&
          otherRow.runs.some(
            (other) =>
              Math.abs(run.x - other.x) <= 4 ||
              Math.abs(right(run) - right(other)) <= 4,
          ),
      ),
    ).length >= 2;
  // A section number and a caption may appear as two text runs; trim these from table edges.
  while (
    active.length &&
    active[0].runs.length < columns.length &&
    !repeatsTwoAlignments(active[0])
  )
    active.shift();
  while (
    active.length &&
    active.at(-1)!.runs.length < columns.length &&
    !repeatsTwoAlignments(active.at(-1)!)
  )
    active.pop();
  if (active.filter((row) => row.runs.length >= 2).length < 2) return null;
  // Repeated alignment distinguishes table rows from ordinary paragraphs split into random words.
  const alignedColumns = columns.filter((column) => {
    const members = active.flatMap((row) =>
      row.runs.filter(
        (run) => run.x >= column.left - 1 && right(run) <= column.right + 1,
      ),
    );
    return members.some((item, itemIndex) =>
      members
        .slice(itemIndex + 1)
        .some(
          (other) =>
            Math.abs(item.x - other.x) <= 4 ||
            Math.abs(right(item) - right(other)) <= 4,
        ),
    );
  }).length;
  if (alignedColumns < 2) return null;
  const resultRows = active.map((row): Cell[] =>
    columns.map((column, columnIndex) => {
      // A sparse row may contain a wider value than its full-row anchors. Use the entire column lane.
      const laneLeft =
        columnIndex === 0
          ? -Infinity
          : (columns[columnIndex - 1].right + column.left) / 2;
      const laneRight =
        columnIndex === columns.length - 1
          ? Infinity
          : (column.right + columns[columnIndex + 1].left) / 2;
      const pieces = row.runs.filter((run) => {
        const center = run.x + run.width / 2;
        return center >= laneLeft && center < laneRight;
      });
      if (!pieces.length)
        return {
          text: "",
          warning: "文字が見つからないセルです。原本が空欄か確認してください。",
        };
      const text = pieces.map((piece) => piece.text).join(" ");
      let warning: string | undefined;
      if (pieces.some((piece) => piece.overlap))
        warning = "文字が重なっています。原本と照合してください。";
      else if (
        pieces.some(
          (piece) => piece.x < laneLeft - 2 || right(piece) > laneRight + 2,
        )
      )
        warning =
          "文字が列の境界にかかっています。セルの区切りを確認してください。";
      else if (pieces.length > 1)
        warning =
          "離れた文字列を同じ列にまとめました。セルの区切りを確認してください。";
      else if (/\ufffd|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))
        warning = "読み取れない文字が含まれています。原本と照合してください。";
      return warning ? { text, warning } : { text };
    }),
  );
  const x = Math.max(0, columns[0].left - 6);
  const y = Math.max(0, active[0].y - 6);
  const bottom = Math.max(...active.map((row) => row.y + row.height)) + 6;
  const headerRow = headerCandidate(resultRows);
  const notes = [
    "文字の位置から行と列を推定しています。結合セル・折り返し・罫線だけの空行や空列は正しく復元できない場合があります。",
  ];
  if (headerRow === 0)
    notes.push("先頭行を見出し候補に設定しました。必要に応じて変更できます。");
  return {
    id: `page-${page}-table-${index + 1}`,
    page,
    name: `表 ${index + 1}`,
    rows: resultRows,
    headerRow,
    bounds: {
      x,
      y,
      width: Math.max(0, Math.min(pageWidth, columns.at(-1)!.right + 6) - x),
      height: Math.max(0, Math.min(pageHeight, bottom) - y),
    },
    notes,
  };
}

/** Pure geometry detector used by both the browser and regression tests. No PDF or network APIs. */
export function detectTables(
  items: TextFragment[],
  page = 1,
  pageWidth = 595,
  pageHeight = 842,
): ExtractedTable[] {
  if (items.length > LIMITS.pageItems)
    throw new Error(
      "1ページの文字データが多すぎます。PDFを小さく分割してください（1ページ40,000項目まで）。",
    );
  const rows = makeRows(items);
  const tables: ExtractedTable[] = [];
  for (const band of splitRowBands(rows)) {
    const columns = inferColumns(band);
    if (columns.length < 2) continue;
    const gaps = columns
      .slice(1)
      .map((column, index) => column.left - columns[index].right);
    const typicalGap = median(gaps);
    const splits = [0];
    for (let index = 2; index <= columns.length - 2; index++) {
      if (gaps[index - 1] > Math.max(96, typicalGap * 3.5, pageWidth * 0.22))
        splits.push(index);
    }
    splits.push(columns.length);
    for (let index = 1; index < splits.length; index++) {
      const start = splits[index - 1];
      const end = splits[index];
      const leftEdge =
        start === 0
          ? -Infinity
          : (columns[start - 1].right + columns[start].left) / 2;
      const rightEdge =
        end === columns.length
          ? Infinity
          : (columns[end - 1].right + columns[end].left) / 2;
      const selectedRows = band.map((row) => ({
        ...row,
        runs: row.runs.filter(
          (run) =>
            run.x + run.width / 2 >= leftEdge &&
            run.x + run.width / 2 < rightEdge,
        ),
      }));
      const table = toTable(
        selectedRows,
        columns.slice(start, end),
        page,
        tables.length,
        pageWidth,
        pageHeight,
      );
      if (table) tables.push(table);
    }
  }
  return tables;
}

export async function extractDocument(
  pdf: PDFDocumentProxy,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedDocument> {
  if (pdf.numPages > 100)
    throw new Error("PDFは100ページ以下に分割してください。");
  const tables: ExtractedTable[] = [];
  const emptyPages: number[] = [];
  let itemCount = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    onProgress?.(pageNumber, pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    if (
      ![viewport.width, viewport.height].every(
        (value) => Number.isFinite(value) && value > 0 && value <= 20_000,
      ) ||
      viewport.width * viewport.height > 100_000_000
    ) {
      throw new Error(
        `${pageNumber}ページ目の用紙サイズが大きすぎます。一般的な用紙サイズに変換してください。`,
      );
    }
    const content = await page.getTextContent();
    itemCount += content.items.length;
    if (
      content.items.length > LIMITS.pageItems ||
      itemCount > LIMITS.documentItems
    )
      throw new Error(
        "文字データが多すぎます。PDFを小さく分割してください（1ページ40,000項目・全体200,000項目まで）。",
      );
    const fragments: TextFragment[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [a, b, c, d, e, f] = item.transform;
      const [va, vb, vc, vd, ve, vf] = viewport.transform;
      const tx = va * e + vc * f + ve;
      const ty = vb * e + vd * f + vf;
      const baselineX = va * a + vc * b;
      const baselineY = vb * a + vd * b;
      // Horizontal writing only. Arbitrarily rotated/vertical writing is not silently flattened into cells.
      if (Math.abs(baselineY) > Math.abs(baselineX) * 0.2) continue;
      const height = Math.max(1, Math.hypot(va * c + vc * d, vb * c + vd * d));
      fragments.push({
        text: item.str,
        x: tx,
        y: ty - height,
        width: item.width,
        height,
      });
    }
    if (!fragments.length) emptyPages.push(pageNumber);
    tables.push(
      ...detectTables(fragments, pageNumber, viewport.width, viewport.height),
    );
    if (tables.length > LIMITS.tables)
      throw new Error(
        "抽出候補が200表を超えました。PDFを小さく分割してください。",
      );
    // Yield between pages so progress and cancel/file replacement controls remain responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { tables, pageCount: pdf.numPages, emptyPages };
}
