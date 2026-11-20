"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Grid2X2,
  Layers,
  LockKeyhole,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ExtractedTable } from "@/lib/types";
import PdfViewer from "./pdf-viewer";

const demos = [
  {
    id: "invoice",
    name: "請求明細",
    text: "品目・数量・金額を抽出",
    meta: "1ページ",
    icon: FileText,
  },
  {
    id: "sales",
    name: "売上一覧",
    text: "ページをまたぐ表を確認",
    meta: "2ページ",
    icon: FileSpreadsheet,
  },
  {
    id: "products",
    name: "商品一覧",
    text: "複数の表と空欄を確認",
    meta: "複数表",
    icon: Layers,
  },
];
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const steps = ["PDFを追加", "表を確認・編集", "ファイルを出力"];
function countWarnings(table: ExtractedTable) {
  return table.rows.flat().filter((c) => c.warning).length;
}
function columnName(i: number): string {
  return i < 26
    ? String.fromCharCode(65 + i)
    : columnName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}
function saveFile(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function Workspace() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const busyRef = useRef(false);
  const cellEdited = useRef(false);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [filename, setFilename] = useState("");
  const [tables, setTables] = useState<ExtractedTable[]>([]);
  const [activeId, setActiveId] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(92);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [emptyPages, setEmptyPages] = useState<number[]>([]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [rowStart, setRowStart] = useState(0);
  const [history, setHistory] = useState<ExtractedTable[][]>([]);
  const [mobileView, setMobileView] = useState("table");
  const [help, setHelp] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [allTables, setAllTables] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [exportName, setExportName] = useState("抽出データ");
  const exportDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const active = tables.find((t) => t.id === activeId);
  const warnings = active ? countWarnings(active) : 0;
  useEffect(() => {
    if (exportOpen) exportDialog.current?.showModal();
    else exportDialog.current?.close();
  }, [exportOpen]);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);
  useEffect(
    () => () => {
      operation.current++;
      void pdfRef.current?.loadingTask.destroy();
    },
    [],
  );

  async function openFile(file: File, reservedOperation?: number) {
    if (reservedOperation === undefined && busyRef.current) return;
    const op = reservedOperation ?? ++operation.current;
    if (op !== operation.current) return;
    busyRef.current = true;
    setError("");
    setNotice("");
    setBusy(true);
    setProgress("PDFを読み込み中…");
    let loaded: PDFDocumentProxy | undefined;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("25MB以下のPDFを選択してください。");
      if (!file.name.toLowerCase().endsWith(".pdf"))
        throw new Error("PDFファイルを選択してください。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
        throw new Error("有効なPDFファイルではありません。");
      const [{ loadPdf }, { extractDocument }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/extract"),
      ]);
      loaded = await loadPdf(bytes);
      const result = await extractDocument(loaded, (p, total) => {
        if (operation.current !== op) throw new Error("キャンセルしました");
        setProgress(`${p} / ${total} ページの表を解析中…`);
      });
      if (operation.current !== op) {
        await loaded.loadingTask.destroy();
        return;
      }
      const old = pdfRef.current;
      pdfRef.current = loaded;
      setPdf(loaded);
      if (old) void old.loadingTask.destroy();
      setFilename(file.name);
      setTables(result.tables);
      setActiveId(result.tables[0]?.id ?? "");
      setPage(result.tables[0]?.page ?? 1);
      setEmptyPages(result.emptyPages);
      setSelected(null);
      setRowStart(0);
      setHistory([]);
      setExportName(file.name.replace(/\.pdf$/i, "") + "_抽出");
      setNotice(
        result.tables.length
          ? `${result.tables.length}件の表候補を抽出しました。原本と見比べて確認してください。`
          : "表候補が見つかりませんでした。文字を選択できる、行・列の揃ったPDFをお試しください。",
      );
    } catch (e) {
      if (loaded && loaded !== pdfRef.current)
        void loaded.loadingTask.destroy();
      if (operation.current === op)
        setError(
          e instanceof Error
            ? e.name === "PasswordException"
              ? "パスワードで保護されたPDFです。保護を解除したファイルを選択してください。"
              : e.message
            : "PDFを読み込めませんでした。別のPDFをお試しください。",
        );
    } finally {
      if (operation.current === op) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  async function openDemo(id: string) {
    if (busyRef.current) return;
    const op = ++operation.current;
    busyRef.current = true;
    setBusy(true);
    setProgress("サンプルPDFを読み込み中…");
    setNotice("");
    try {
      setError("");
      const response = await fetch(`/demos/${id}.pdf`);
      if (!response.ok) throw new Error("サンプルを読み込めませんでした。");
      const blob = await response.blob();
      if (op !== operation.current) return;
      await openFile(
        new File(
          [blob],
          `${demos.find((d) => d.id === id)?.name}_サンプル.pdf`,
          { type: "application/pdf" },
        ),
        op,
      );
    } catch (e) {
      if (op === operation.current)
        setError(
          e instanceof Error ? e.message : "サンプルを読み込めませんでした。",
        );
    } finally {
      if (op === operation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  function checkpoint() {
    setHistory((h) => [...h.slice(-29), tables]);
  }
  function mutate(
    fn: (table: ExtractedTable) => ExtractedTable,
    snapshot = true,
  ) {
    if (!active) return;
    if (snapshot) checkpoint();
    setTables((ts) => ts.map((t) => (t.id === activeId ? fn(t) : t)));
    setNotice("");
  }
  function undo() {
    const previous = history.at(-1);
    if (previous) {
      setTables(previous);
      setHistory((h) => h.slice(0, -1));
      setSelected(null);
      setRowStart(0);
      setNotice("直前の編集を元に戻しました。");
    }
  }
  function chooseTable(t: ExtractedTable) {
    setActiveId(t.id);
    setPage(t.page);
    setSelected(null);
    setRowStart(0);
  }
  async function download() {
    if (!active || !reviewed || exporting) return;
    setExporting(true);
    setError("");
    try {
      const { createCsv, createXlsx } = await import("@/lib/export");
      const safeName =
        exportName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") ||
        "抽出データ";
      if (format === "csv")
        saveFile(
          createCsv(active),
          `${safeName}.csv`,
          "text/csv;charset=utf-8",
        );
      else {
        const bytes = await createXlsx(allTables ? tables : [active]);
        saveFile(
          new Uint8Array(bytes).buffer,
          `${safeName}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      }
      setExportOpen(false);
      setNotice(
        `${format.toUpperCase()}ファイルを作成し、ダウンロードを開始しました。`,
      );
    } catch {
      setError("ファイルの出力に失敗しました。もう一度お試しください。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setHelp(true)}
          aria-label="PDF表データ抽出・CSV変換ツール の使い方"
        >
          <Image src="/icon.svg" width={42} height={42} alt="" />
          <span>
            PDF表データ抽出<span>CSV変換ツール</span>
          </span>
        </button>
        <div className="workspace-label">ワークスペース</div>
        <div className="nav-current">
          <Table2 size={18} /> PDFから表を抽出
        </div>
        <div className="sidebar-flow">
          <div className="workspace-label">かんたん 3 ステップ</div>
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flow-item ${i === (pdf ? 1 : 0) ? "current" : ""} ${pdf && i === 0 ? "complete" : ""}`}
            >
              <span>{pdf && i === 0 ? <Check size={13} /> : `0${i + 1}`}</span>
              <div>
                {s}
                <small>
                  {["ドラッグ＆ドロップ", "原本と比べて調整", "CSV / Excel"][i]}
                </small>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={22} />
            <strong>
              あなたのファイルは
              <br />
              あなたのブラウザ内に。
            </strong>
            <p>PDF・抽出データを外部サーバーへ送信することはありません。本番ページ末尾の広告配信（忍者AdMax）は、これらの内容とは無関係です。</p>
          </div>
          <button className="help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> 使い方・対応するPDF{" "}
            <ArrowRight size={14} />
          </button>
          <span className="side-foot">業務効率化ツール / PDF・データ抽出</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            ツール <ChevronRight size={13} /> <strong>PDF・データ抽出</strong>
          </span>
          <span className="local-badge">
            <span /> ブラウザ内で処理 <LockKeyhole size={12} />
          </span>
        </header>
        <main data-ready={ready}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PDF TO SPREADSHEET</div>
              <h1>PDF表データ抽出・CSV変換ツール</h1>
              <p>PDFの表を取り出して、確認・編集。そのまま使えるデータへ。</p>
            </div>
            {pdf && (
              <button
                className="button secondary"
                disabled={busy || !ready}
                onClick={() => input.current?.click()}
              >
                <Plus size={16} /> 別のPDFを追加
              </button>
            )}
          </div>
          <div className="step-bar" aria-label="作業の流れ">
            {steps.map((s, i) => (
              <div
                key={s}
                className={
                  i === (exportOpen ? 2 : pdf ? 1 : 0)
                    ? "active"
                    : pdf && i === 0
                      ? "done"
                      : ""
                }
              >
                <span>{pdf && i === 0 ? <Check size={12} /> : i + 1}</span>
                {s}
                {i < 2 && <ChevronRight className="step-chevron" size={16} />}
              </div>
            ))}
          </div>
          <input
            ref={input}
            data-testid="pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            aria-label="PDFファイルを選択"
            disabled={busy || !ready}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openFile(f);
              e.target.value = "";
            }}
          />
          {error && (
            <div className="message error" role="alert">
              <TriangleAlert size={18} />
              {error}
              <button aria-label="エラーを閉じる" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="message processing" role="status">
              <span className="spinner" />
              {progress}
              <button
                onClick={() => {
                  operation.current++;
                  busyRef.current = false;
                  setBusy(false);
                  setNotice("読み込みをキャンセルしました。");
                }}
              >
                キャンセル
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={17} />
              {notice}
              <button aria-label="通知を閉じる" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!pdf ? (
            <>
              <section
                className={`upload-area ${dragging ? "dragging" : ""}`}
                aria-label="PDFアップロード"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void openFile(f);
                }}
              >
                <div className="upload-art">
                  <div className="art-sheet">
                    <FileText size={33} strokeWidth={1.4} />
                    <span>PDF</span>
                  </div>
                  <span className="art-arrow">
                    <ArrowRight size={18} />
                  </span>
                  <div className="art-table">
                    <Table2 size={33} strokeWidth={1.4} />
                  </div>
                </div>
                <h2>
                  {dragging
                    ? "ここにドロップして抽出"
                    : "PDFをここにドラッグ＆ドロップ"}
                </h2>
                <p>表の検出から抽出まで、自動で行います。</p>
                <button
                  className="button primary"
                  disabled={busy || !ready}
                  onClick={() => input.current?.click()}
                >
                  <FolderOpen size={18} /> PDFファイルを選択
                </button>
                <div className="upload-meta">
                  テキストPDF・複数ページ対応 <span>·</span> 最大25MB /
                  100ページ
                </div>
              </section>
              <div className="upload-note">
                <LockKeyhole size={14} />
                <span>PDFファイルを外部へアップロード送信することはありません</span>
                <span className="note-divider">|</span>
                <span>スキャンPDF・OCRには未対応</span>
              </div>
              <section className="demos">
                <div className="section-title">
                  <h2>まずはサンプルで試す</h2>
                  <span>ファイルがなくても、すぐに体験できます</span>
                </div>
                <div className="demo-grid">
                  {demos.map((d) => (
                    <button
                      key={d.id}
                      className="demo-card"
                      disabled={busy || !ready}
                      onClick={() => void openDemo(d.id)}
                    >
                      <span className={`demo-icon ${d.id}`}>
                        <d.icon size={23} strokeWidth={1.6} />
                      </span>
                      <div>
                        <strong>
                          {d.name}
                          <small>{d.meta}</small>
                        </strong>
                        <p>{d.text}</p>
                      </div>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </div>
                <p className="demo-disclaimer">
                  すべて架空のデータです。サンプルも通常のPDFと同じ処理で抽出します。
                </p>
              </section>
              <div className="feature-strip">
                <div>
                  <Grid2X2 size={20} />
                  <span>
                    <strong>表を自動で検出</strong>
                    <small>複数ある表も選んで抽出</small>
                  </span>
                </div>
                <div>
                  <SlidersHorizontal size={20} />
                  <span>
                    <strong>見ながら整える</strong>
                    <small>セル編集・行列削除・見出し指定</small>
                  </span>
                </div>
                <div>
                  <ArrowDownToLine size={20} />
                  <span>
                    <strong>日本語のまま出力</strong>
                    <small>UTF-8 BOM付きCSV / XLSX</small>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <section className="document-workspace" aria-busy={busy}>
              <div className="file-summary">
                <div className="file-symbol">
                  <FileText size={23} />
                </div>
                <div>
                  <strong>{filename}</strong>
                  <small>
                    {pdf.numPages}ページ <span>·</span> PDF文書 <span>·</span>{" "}
                    このブラウザのみ
                  </small>
                </div>
                <span className="detected-pill">
                  <Check size={14} />
                  {tables.length}件の表候補
                </span>
              </div>
              {emptyPages.length > 0 && (
                <div className="message warning">
                  <TriangleAlert size={16} />
                  {emptyPages.join(", ")}
                  ページ目には抽出できる文字がありません。スキャンPDFのOCRは未対応です。
                </div>
              )}
              <div className="table-selector-heading">
                <h2>
                  抽出された表 <span>{tables.length}</span>
                </h2>
                <p>確認する表を選んでください</p>
              </div>
              <div className="table-selector" aria-label="抽出対象の表">
                {tables.map((t, i) => (
                  <button
                    key={t.id}
                    className={`table-choice ${activeId === t.id ? "selected" : ""}`}
                    onClick={() => chooseTable(t)}
                  >
                    <Table2 size={21} />
                    <span>
                      <strong>
                        表 {i + 1}
                        <small>ページ {t.page}</small>
                      </strong>
                      <span>
                        {t.rows.length}行 × {t.rows[0]?.length ?? 0}列
                        {countWarnings(t) > 0 && (
                          <b> · 要確認 {countWarnings(t)}</b>
                        )}
                      </span>
                    </span>
                    <span className="choice-radio">
                      {activeId === t.id && <Check size={11} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mobile-switch">
                <button
                  className={mobileView === "pdf" ? "active" : ""}
                  onClick={() => setMobileView("pdf")}
                >
                  元のPDF
                </button>
                <button
                  className={mobileView === "table" ? "active" : ""}
                  onClick={() => setMobileView("table")}
                >
                  抽出テーブル
                </button>
              </div>
              <div className={`comparison show-${mobileView}`}>
                <section className="viewer-panel">
                  <div className="panel-title">
                    <span>
                      <FileText size={16} />
                      <strong>元のPDF</strong>
                    </span>
                    <span className="original-tag">ORIGINAL</span>
                  </div>
                  <div className="viewer-toolbar">
                    <div className="pager">
                      <button
                        aria-label="前のページ"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        {page} / {pdf.numPages}
                      </span>
                      <button
                        aria-label="次のページ"
                        disabled={page >= pdf.numPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="zoom">
                      <button
                        aria-label="縮小"
                        disabled={zoom <= 60}
                        onClick={() => setZoom((z) => z - 10)}
                      >
                        <Minus size={15} />
                      </button>
                      <span>{zoom}%</span>
                      <button
                        aria-label="拡大"
                        disabled={zoom >= 150}
                        onClick={() => setZoom((z) => z + 10)}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  <PdfViewer pdf={pdf} page={page} table={active} zoom={zoom} />
                  <div className="panel-foot">
                    <span className="range-dot" />{" "}
                    青枠は選択中の表の検出範囲です
                  </div>
                </section>
                <section className="editor-panel">
                  <div className="panel-title">
                    <span>
                      <Table2 size={16} />
                      <strong>抽出テーブル</strong>
                      <span className="editable-tag">編集可能</span>
                    </span>
                    <button
                      className="text-button"
                      onClick={undo}
                      disabled={!history.length}
                    >
                      <RotateCcw size={14} /> 元に戻す
                    </button>
                  </div>
                  {active ? (
                    <>
                      <div className="edit-toolbar">
                        <label>
                          見出し行
                          <select
                            aria-label="見出し行"
                            value={active.headerRow ?? "none"}
                            onChange={(e) =>
                              mutate((t) => ({
                                ...t,
                                headerRow:
                                  e.target.value === "none"
                                    ? null
                                    : Number(e.target.value),
                              }))
                            }
                          >
                            <option value="none">なし</option>
                            {active.rows.map((_, i) => (
                              <option value={i} key={i}>
                                {i + 1}行目{i === 0 ? "（候補）" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div>
                          <button
                            title="選択セルの行を削除"
                            aria-label="選択行を削除"
                            disabled={!selected || active.rows.length <= 1}
                            onClick={() => {
                              if (!selected) return;
                              const row = selected.row;
                              mutate((t) => ({
                                ...t,
                                rows: t.rows.filter((_, i) => i !== row),
                                headerRow:
                                  t.headerRow === row
                                    ? null
                                    : t.headerRow !== null && t.headerRow > row
                                      ? t.headerRow - 1
                                      : t.headerRow,
                              }));
                              setSelected(null);
                              if (rowStart >= active.rows.length - 1)
                                setRowStart((s) => Math.max(0, s - 50));
                            }}
                          >
                            <Trash2 size={14} /> 行
                          </button>
                          <button
                            title="選択セルの列を削除"
                            aria-label="選択列を削除"
                            disabled={
                              !selected || (active.rows[0]?.length ?? 0) <= 1
                            }
                            onClick={() => {
                              if (!selected) return;
                              const col = selected.col;
                              mutate((t) => ({
                                ...t,
                                rows: t.rows.map((r) =>
                                  r.filter((_, i) => i !== col),
                                ),
                              }));
                              setSelected(null);
                            }}
                          >
                            <Trash2 size={14} /> 列
                          </button>
                        </div>
                      </div>
                      <div className="formula-bar">
                        <span>
                          {selected
                            ? `${columnName(selected.col)}${selected.row + 1}`
                            : "セル"}
                        </span>
                        <span>ƒx</span>
                        <p>
                          {selected
                            ? active.rows[selected.row]?.[selected.col]?.text ||
                              "空のセル"
                            : "セルをクリックして直接編集できます"}
                        </p>
                      </div>
                      <div className="spreadsheet-scroll">
                        <table
                          className="spreadsheet"
                          aria-label="抽出結果の編集"
                        >
                          <thead>
                            <tr>
                              <th aria-label="行番号" />
                              {active.rows[0]?.map((_, ci) => (
                                <th key={ci}>{columnName(ci)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {active.rows
                              .slice(rowStart, rowStart + 50)
                              .map((row, offset) => {
                                const ri = rowStart + offset;
                                return (
                                  <tr
                                    key={`${active.id}-${ri}`}
                                    className={
                                      active.headerRow === ri
                                        ? "header-row"
                                        : ""
                                    }
                                  >
                                    <th scope="row">{ri + 1}</th>
                                    {row.map((cell, ci) => (
                                      <td
                                        key={ci}
                                        className={`${cell.warning ? "uncertain" : ""} ${selected?.row === ri && selected?.col === ci ? "cell-selected" : ""}`}
                                        title={cell.warning}
                                      >
                                        <input
                                          aria-describedby={
                                            cell.warning
                                              ? `warning-${ri}-${ci}`
                                              : undefined
                                          }
                                          aria-label={`${columnName(ci)}${ri + 1}${cell.warning ? " 要確認" : ""}`}
                                          value={cell.text}
                                          onFocus={() => {
                                            setSelected({ row: ri, col: ci });
                                            cellEdited.current = false;
                                          }}
                                          onChange={(e) => {
                                            if (!cellEdited.current) {
                                              checkpoint();
                                              cellEdited.current = true;
                                            }
                                            mutate(
                                              (t) => ({
                                                ...t,
                                                rows: t.rows.map((r, rj) =>
                                                  rj === ri
                                                    ? r.map((c, cj) =>
                                                        cj === ci
                                                          ? {
                                                              text: e.target
                                                                .value,
                                                            }
                                                          : c,
                                                      )
                                                    : r,
                                                ),
                                              }),
                                              false,
                                            );
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              const nextRow = Math.min(
                                                ri + 1,
                                                active.rows.length - 1,
                                              );
                                              document
                                                .querySelector<HTMLInputElement>(
                                                  `input[aria-label^="${columnName(ci)}${nextRow + 1}"]`,
                                                )
                                                ?.focus();
                                            }
                                          }}
                                        />
                                        {cell.warning && (
                                          <>
                                            <span
                                              className="cell-warning"
                                              aria-hidden="true"
                                            />
                                            <span
                                              id={`warning-${ri}-${ci}`}
                                              className="visually-hidden"
                                            >
                                              {cell.warning}
                                            </span>
                                          </>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      <div className="row-pagination">
                        <span>
                          {rowStart + 1}–
                          {Math.min(rowStart + 50, active.rows.length)} /{" "}
                          {active.rows.length} 行
                        </span>
                        {active.rows.length > 50 && (
                          <div>
                            <button
                              aria-label="前の50行"
                              disabled={rowStart === 0}
                              onClick={() => {
                                setRowStart((s) => Math.max(0, s - 50));
                                setSelected(null);
                              }}
                            >
                              <ChevronLeft size={14} /> 前へ
                            </button>
                            <button
                              aria-label="次の50行"
                              disabled={rowStart + 50 >= active.rows.length}
                              onClick={() => {
                                setRowStart((s) => s + 50);
                                setSelected(null);
                              }}
                            >
                              次へ <ChevronRight size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        className={`table-feedback ${warnings ? "has-warning" : ""}`}
                      >
                        {warnings ? (
                          <>
                            <TriangleAlert size={15} />
                            <span>
                              <strong>{warnings}セルを要確認</strong> —
                              空欄や文字配置を原本と確認してください
                            </span>
                          </>
                        ) : (
                          <>
                            <Check size={15} />
                            <span>
                              抽出内容は、出力前に原本と確認してください
                            </span>
                          </>
                        )}
                      </div>
                      <div className="panel-foot">
                        <span>
                          {active.rows.length}行 × {active.rows[0]?.length}列
                        </span>
                        <span>
                          {active.headerRow === null
                            ? "見出しなし"
                            : `${active.headerRow + 1}行目を見出しに指定`}{" "}
                          <span className="foot-dot">·</span>{" "}
                          変更はブラウザ内のみ
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="empty-result">
                      <Table2 size={40} />
                      <h3>表候補が見つかりませんでした</h3>
                      <p>
                        罫線や文字の配置が複雑なPDFは検出できない場合があります。別のファイルをお試しください。
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => input.current?.click()}
                      >
                        別のPDFを選択
                      </button>
                    </div>
                  )}
                </section>
              </div>
              <div className="export-bar">
                <div>
                  <ShieldCheck size={19} />
                  <span>
                    <strong>内容を確認したら、データを出力</strong>
                    <small>
                      選択した表をCSVに。複数の表はExcelのシートに。
                    </small>
                  </span>
                </div>
                <button
                  className="button primary"
                  disabled={!active || busy}
                  onClick={() => {
                    setReviewed(false);
                    setExportOpen(true);
                  }}
                >
                  <ArrowDownToLine size={17} /> ダウンロード{" "}
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="workspace-notes">
                <p>
                  結合セル・複雑な段組み・折り返しを含む表は、行や列が正しく検出されない場合があります。
                </p>
                <button className="text-button" onClick={() => setHelp(true)}>
                  対応するPDF・使い方 <ArrowRight size={13} />
                </button>
              </div>
            </section>
          )}
          <footer>
            <span>PDF表データ抽出・CSV変換ツール</span>
            <span>
              <LockKeyhole size={11} /> アカウント不要 <span>·</span>{" "}
              ローカル処理
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={exportDialog}
        className="modal export-modal"
        aria-labelledby="export-title"
        onCancel={() => setExportOpen(false)}
        onClose={() => setExportOpen(false)}
      >
        <div className="modal-heading">
          <div className="modal-icon">
            <ArrowDownToLine size={24} />
          </div>
          <button
            aria-label="出力画面を閉じる"
            onClick={() => setExportOpen(false)}
          >
            <X size={21} />
          </button>
        </div>
        <h2 id="export-title">データをダウンロード</h2>
        <p className="modal-subtitle">
          確認・編集した内容をファイルに書き出します。
        </p>
        <div className="format-options">
          <button
            className={format === "csv" ? "selected" : ""}
            onClick={() => setFormat("csv")}
          >
            <FileText size={23} />
            <strong>CSV</strong>
            <span>UTF-8 / BOM付き</span>
            <small>選択中の表を出力</small>
          </button>
          <button
            className={format === "xlsx" ? "selected" : ""}
            onClick={() => setFormat("xlsx")}
          >
            <FileSpreadsheet size={23} />
            <strong>Excel</strong>
            <span>.xlsx</span>
            <small>表ごとにシートを作成</small>
          </button>
        </div>
        <label className="filename-label">
          ファイル名
          <div>
            <input
              aria-label="出力ファイル名"
              value={exportName}
              maxLength={100}
              onChange={(e) => setExportName(e.target.value)}
            />
            <span>.{format}</span>
          </div>
        </label>
        {format === "xlsx" && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={allTables}
              onChange={(e) => setAllTables(e.target.checked)}
            />
            すべての表を出力する（{tables.length}シート）
          </label>
        )}
        <div className="export-summary">
          <Table2 size={17} />
          <span>
            {format === "xlsx" && allTables
              ? `${tables.length}件の表`
              : `選択中の表 · ${active?.rows.length ?? 0}行 × ${active?.rows[0]?.length ?? 0}列`}
          </span>
          <span>日本語対応</span>
        </div>
        <p className="export-hint">
          先頭ゼロや数値の文字列保持にはXLSXをご利用ください。CSVでは式の誤実行を防ぐため、一部の値に「&apos;」を付けます。
        </p>
        <label className="checkbox-row review-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          元のPDFと抽出内容を確認しました
        </label>
        <button
          className="button primary download-button"
          disabled={!reviewed || exporting}
          onClick={() => void download()}
        >
          {exporting ? (
            <span className="spinner" />
          ) : (
            <ArrowDownToLine size={17} />
          )}
          {exporting
            ? "ファイルを作成中…"
            : `${format.toUpperCase()}をダウンロード`}
        </button>
        <div className="modal-privacy">
          <LockKeyhole size={12} /> ファイルはこのブラウザ内で作成されます
        </div>
      </dialog>
      <dialog
        ref={helpDialog}
        className="modal help-modal"
        aria-labelledby="help-title"
        onCancel={() => setHelp(false)}
        onClose={() => setHelp(false)}
      >
        <div className="modal-heading">
          <h2 id="help-title">使い方・対応するPDF</h2>
          <button aria-label="ヘルプを閉じる" onClick={() => setHelp(false)}>
            <X size={21} />
          </button>
        </div>
        <ol>
          <li>
            <strong>PDFを追加</strong>
            <p>25MB以下・100ページ以下の、文字を選択できるPDFを選びます。</p>
          </li>
          <li>
            <strong>表を確認・編集</strong>
            <p>
              抽出された表を選択し、原本と見比べます。セルをクリックして編集。選択したセルの行・列を削除できます。見出し行を選ぶと、出力時に先頭へ移動します。他の行も保持します。
            </p>
          </li>
          <li>
            <strong>CSV / XLSXを出力</strong>
            <p>
              確認チェックを入れてダウンロード。CSVは選択した1表、XLSXは表ごとにシートを作成できます。
            </p>
          </li>
        </ol>
        <div className="help-note">
          <strong>対応範囲</strong>
          <p>
            テキストPDF・日本語・複数ページに対応。文字位置から行・列を推定します。スキャンPDFのOCRには未対応です。結合セル、縦書き、複雑な段組みや折り返しは正しく抽出できない場合があります。各ページの表は別の候補になります。
          </p>
          <p>
            黄色のセルは、空欄や文字配置が曖昧な箇所です。警告がないセルも原本と確認してください。精度の保証やパーセント表示は行いません。
          </p>
          <strong>データの扱い</strong>
          <p>
            PDF・抽出データは外部サーバーへ送信せず、メモリ内で処理します。ページを閉じる・再読み込みすると編集内容は消えます。アプリの配信、サンプルの読み込み、および本番ページ末尾の広告配信（忍者AdMax）には通信が発生しますが、PDFや抽出データを広告のために送信することはありません。
          </p>
        </div>
        <button className="button primary" onClick={() => setHelp(false)}>
          作業に戻る
        </button>
      </dialog>
    </div>
  );
}
