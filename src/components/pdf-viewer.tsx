"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { ExtractedTable } from "@/lib/types";
export default function PdfViewer({
  pdf,
  page,
  table,
  zoom,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  table?: ExtractedTable;
  zoom: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 595, height: 842 });
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let render: RenderTask | undefined;
    (async () => {
      try {
        const p = await pdf.getPage(page);
        if (cancelled || !canvas.current) return;
        const viewport = p.getViewport({ scale: 1 });
        setSize({ width: viewport.width, height: viewport.height });
        const scale = Math.min(
          1.6,
          8192 / viewport.width,
          8192 / viewport.height,
          Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
        );
        const scaled = p.getViewport({ scale });
        const c = canvas.current;
        c.width = scaled.width;
        c.height = scaled.height;
        render = p.render({ canvas: c, viewport: scaled });
        await render.promise;
        if (!cancelled) setError("");
      } catch (e) {
        if (
          !cancelled &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setError(
            "PDFの表示に失敗しました。ファイルを読み込み直してください。",
          );
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page]);
  return (
    <div className="pdf-scroll">
      {error && <p role="alert">{error}</p>}
      <div
        className="pdf-paper"
        style={{
          width: `${zoom}%`,
          aspectRatio: `${size.width}/${size.height}`,
        }}
      >
        <canvas ref={canvas} aria-label={`元のPDF ${page}ページ目`} />
        {table && table.page === page && (
          <div
            className="table-outline"
            style={{
              left: `${(table.bounds.x / size.width) * 100}%`,
              top: `${(table.bounds.y / size.height) * 100}%`,
              width: `${(table.bounds.width / size.width) * 100}%`,
              height: `${(table.bounds.height / size.height) * 100}%`,
            }}
          >
            <span>表の検出範囲</span>
          </div>
        )}
      </div>
    </div>
  );
}
