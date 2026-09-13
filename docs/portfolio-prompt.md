# 既存ポートフォリオ追加用・完全版プロンプト

この文書は、完成アプリ、公開Repository、README、本番スクリーンショット5枚、および既存 `my-homepage` のデータ構造を確認して作成しました。以下をポートフォリオの開発タスクへ貼り付けて使用してください。今回の開発ではポートフォリオ本体は変更していません。

---

既存ポートフォリオへ、完成済みの「PDF表データ抽出・CSV変換ツール」を新規作品として追加してください。計画の提示だけで止めず、画像配置、作品データ、一覧・詳細・リンク、レスポンシブ表示の確認まで実装してください。既存作品や未コミットの変更を保護し、現在のデザインと公開構成に合わせて統合してください。

## 最初に確認するもの

- 対象ポートフォリオ: `my-homepage`
- Repository: https://github.com/shunsoco-stack/my-homepage
- 既存実装: Vite / React / TypeScript
- 共通作品データ: `src/mocks/works.ts` の `WorkItem`、`works`、`workCategories`
- カード: `src/components/feature/WorkCard.tsx`
- 詳細モーダル: `src/components/feature/WorkDetailModal.tsx`
- トップページ作品一覧: `src/pages/home/components/Works.tsx`
- 全作品一覧: `src/pages/works/components/WorksGrid.tsx`
- 公開パスの解決: `src/utils/resolvePublicUrl`

実行時のファイル構成を再確認してください。`DEVELOPMENT_RULES.md` と適用範囲内の `AGENTS.md` があれば、変更前に読んで従ってください。apple-design Skillがあれば使用してください。新しいUIを一式作り直さず、既存のカード、詳細モーダル、5枚ギャラリー機能を活用してください。

## 作品の確定情報

| 項目 | 値 |
| --- | --- |
| アプリ名 | PDF表データ抽出・CSV変換ツール |
| カテゴリ | 業務効率化ツール |
| サブカテゴリ | PDF・データ抽出 |
| 制作年 | 2026 |
| 公開アプリ | https://pdf-table-extractor-phi.vercel.app |
| Public Repository | https://github.com/shunsoco-stack/pdf-table-extractor |
| README | https://github.com/shunsoco-stack/pdf-table-extractor#readme |
| 制作区分 | Concept Project / 自主制作 |
| メインCTA | ツールを使う |

アプリ名を独自ブランドに変えないでください。実在企業からの受託・導入実績や売上改善実績として扱わないでください。

## 説明文

カード用:

> PDF内の表をブラウザで抽出し、原本と比較しながらセルや見出しを整えてCSV・Excelに変換。日本語・複数ページ・複数表に対応した、登録不要の業務効率化ツール。

詳細用:

> 請求明細、売上一覧、商品一覧など、PDFの表を手作業で転記する負担を減らすために制作しました。アクセス直後にPDFをドラッグ＆ドロップすると、文字の配置から行・列・セル・見出し候補を推定します。抽出した表を選び、元のPDFと見比べながらセル編集、行・列の削除、見出し指定を行い、内容を確認してCSVまたはXLSXへ出力できます。ユーザーのPDFや抽出データはサーバーへ送信せず、ブラウザ内で処理します。

技術・設計の見どころ:

- 最初の画面からファイルを投入できる、説明を読む必要のない作業導線。
- PDF.jsの文字座標を用いた表検出。複数ページ・同一ページ内の複数表を扱う。
- デスクトップのPDF／表比較と、モバイルの表示切替。
- 根拠付きの要確認セル、空欄の保持、実編集だけを記録するUndo。
- UTF-8 BOM付きCSV、文字列と先頭ゼロを保持するXLSX、複数シート出力。
- PDF読込・編集・出力のブラウザ内処理。サーバーAPI・データベース不要。
- 実日本語PDFとCSV／XLSXの読戻し、ブラウザでのアップロードからダウンロードまでの検証。

バッジ候補:

`ブラウザ内処理` / `日本語PDF` / `セル編集` / `CSV・XLSX出力`

技術タグ:

`Next.js` / `React` / `TypeScript` / `PDF.js` / `ExcelJS` / `Vercel`

補足としてVitest、Playwright、apple-designの利用を記載して構いません。

## 正確に記載する制約

- 対応は文字を選択できるテキストPDF。**スキャンPDFのOCRは未対応**。
- 最大25MB・100ページ。PDF形式によって表を検出できない場合がある。
- 結合セル、縦書き、複雑な段組み、折り返しなどは正しく復元できない場合がある。
- ページをまたぐ表はページごとの候補であり、自動連結機能はない。
- 警告の有無に関係なく、利用者が原本を確認する必要がある。
- 精度パーセントや架空の処理速度・工数削減率を付け足さない。
- CSVはUTF-8 BOM付き。Excelの自動型推論で先頭ゼロが変わる場合があるため、保持が必要な用途ではXLSXを案内する。
- CSVの数式形式の値には誤実行防止のため `'` を補う。XLSXは値を文字列として格納する。
- アプリ配信・サンプルPDF・PDF.jsアセット取得には通信がある。「ネット接続一切不要」や「通信ゼロ」と表現しない。
- 編集内容はメモリ内のみ。再読込・タブを閉じると消える。クラウド保存、履歴の永続保存、共同編集はない。
- 同梱の3デモはすべて架空データ。ただしデモ専用の固定表表示ではなく、実ファイルと同じ抽出処理で動作する。

## 使用する本番画像

アプリRepositoryの `docs/screenshots/` にある以下の5枚を使ってください。アプリ本番から取得・検証済みです。仮画像や画像生成によるUIで置き換えないでください。

| 順番 | 元のファイル | 表示ラベル | alt |
| --- | --- | --- | --- |
| 1 | `01-pdf-upload.png` | PDF Upload | PDFをドラッグ＆ドロップし、架空の請求明細・売上・商品デモを選べる初期画面 |
| 2 | `02-pdf-table-preview.png` | PDF + Table Preview | 元のPDFと抽出表を左右で比較し、空欄セルの要確認表示を確認する画面 |
| 3 | `03-table-edit.png` | Table編集 | 抽出した日本語セルを直接編集し、見出し指定・行列削除・Undoを利用する画面 |
| 4 | `04-multiple-tables.png` | 複数表選択 | 商品一覧PDFから検出した同一ページの2表を切り替える画面 |
| 5 | `05-export.png` | Export | CSVとExcel形式、ファイル名、内容確認チェックを指定してダウンロードする画面 |

取得先例:

`https://raw.githubusercontent.com/shunsoco-stack/pdf-table-extractor/main/docs/screenshots/01-pdf-upload.png`

5枚をポートフォリオの `public/works/pdf-table-extractor/` へ配置してください。`public/works/pdf-table-extractor.webp` をカード用カバーとして、2枚目の比較画面から作成してください。既存カードの縦横比・object-positionに合わせ、PDFと表の両方が見えるように確認してください。ギャラリーには元の5枚をそのまま残してください。

必要なら専用アイコンも以下から取得できます:

`https://raw.githubusercontent.com/shunsoco-stack/pdf-table-extractor/main/public/icon.svg`

## データとUIへの追加

1. 最新の `works` を確認し、重複しないIDを割り当てる。この文書作成時の最大IDは10ですが、11を無条件で固定しない。
2. `workCategories` に「業務効率化ツール」がなければ追加。「業務効率化システム」など既存カテゴリを改名・統合しない。
3. トップと `/works` の両方が使用する共通データへ1件追加し、トップで見つけられる位置に配置する。既存作品を削除しない。
4. `label: "Concept Project / 自主制作"` と制作区分を示す。`demo` は既存UIの意味を確認し、自主制作であることと実アプリが操作可能であることが両立する値・表示にする。
5. `category`、`subcategory`、`description`、`tags`、`badges`、`note`、`image`、`gallery` を設定する。
6. `appUrl` と外部表示用 `url` は `https://pdf-table-extractor-phi.vercel.app`、`githubUrl` は `https://github.com/shunsoco-stack/pdf-table-extractor`。`ctaLabel` は「ツールを使う」。詳細モーダルが既存カードから開く構造は維持する。
7. 既存 `WorkDetailModal` のギャラリーに5枚を登録し、順番・ラベル・alt・選択状態を設定する。
8. GitHub、公開アプリ、READMEの導線を分かりやすくする。READMEリンクの専用フィールドがない場合、既存UIの構造を確認し、最小限の変更で追加する。外部リンクは適切な `rel` を設定する。
9. GitHub Pagesの `/my-homepage/` を含むbaseパスに対応する既存の `resolvePublicUrl` を使い続ける。画像や内部リンクの先頭 `/` をそのままルートホストに解決して壊さない。

詳細のnote例:

> 自主制作の実用Webツールです。PDF・抽出データをサーバーに送信せずブラウザ内で処理します。スキャンPDFのOCRは未対応。結合セルなど複雑な表は原本との確認が必要です。

## 完了前の確認

- 現行ポートフォリオのスクリプトに従って `npm run lint`、`npm run type-check`、`npm run build` を実行する。既存エラーがある場合は今回の差分との関係を明記する。
- PCとスマートフォンでカード、カテゴリ絞り込み、詳細モーダル、5枚切替、画像拡大／表示、閉じる操作、キーボード操作を確認する。
- トップと全作品一覧の両方で追加作品が表示されることを確認する。
- 本番公開アプリとGitHub／READMEが正しいURLへ遷移することを確認する。
- 画像5枚が読み込めること、画像の文字が極端に切れていないこと、横方向にはみ出さないことを確認する。
- 未実装のOCR・精度保証・クラウド保存や、架空の導入実績を掲載していないことを読み直す。
- 作業差分とSecret Scanを確認し、実行時に承認されている既存公開フローに従う。画像や設定だけ追加して未確認のまま完了扱いにしない。

最終報告には、変更ファイル、画像5枚の配置先、確認した画面・リンク、テスト結果、ポートフォリオへの反映状況を記載してください。新しいツール本体の再開発は不要です。
