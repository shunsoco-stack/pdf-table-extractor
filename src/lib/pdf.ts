import type { PDFDocumentProxy } from "pdfjs-dist";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 100;

/** The PDF and its text never leave this browser. Only same-origin PDF.js assets are fetched. */
export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  if (!data.byteLength)
    throw new Error("PDFが空です。別のファイルを選択してください。");
  if (data.byteLength > MAX_PDF_BYTES)
    throw new Error("PDFは25MB以下にしてください。");
  // Import on demand: PDF.js needs browser APIs and must not execute during Next.js SSR.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: data.slice(),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    maxImageSize: 16_000_000,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      await pdf.loadingTask.destroy();
      throw new Error("PDFは100ページ以下に分割してください。");
    }
    return pdf;
  } catch (error) {
    await task.destroy();
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error(
        "パスワード付きPDFには対応していません。解除したPDFを選択してください。",
      );
    }
    if (error instanceof Error && error.name === "InvalidPDFException") {
      throw new Error(
        "PDFを読み込めませんでした。ファイルが壊れていないか確認してください。",
      );
    }
    throw error;
  }
}
