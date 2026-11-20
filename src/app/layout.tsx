import type { Metadata } from "next";
import "./globals.css";
import { LegalFooter } from "@/components/legal-footer";
export const metadata: Metadata = {
  title: "PDF表データ抽出・CSV変換ツール",
  description:
    "PDFの表をブラウザ内で抽出。原本と比較してセルを編集し、日本語CSV・XLSXに出力できる無料の業務効率化ツール。テキストPDF・複数ページに対応。",
  applicationName: "PDF表データ抽出・CSV変換ツール",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}
        <LegalFooter /></body>
    </html>
  );
}
