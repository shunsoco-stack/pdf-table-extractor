export type Cell = { text: string; warning?: string };
export type ExtractedTable = {
  id: string;
  page: number;
  name: string;
  rows: Cell[][];
  headerRow: number | null;
  bounds: { x: number; y: number; width: number; height: number };
  notes: string[];
};
export type ExtractedDocument = {
  tables: ExtractedTable[];
  pageCount: number;
  emptyPages: number[];
};
