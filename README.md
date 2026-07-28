# ELF Roast Record Final

ELF COFFEE ROASTERS 向けの軽量な焙煎記録ブラウザアプリです。

## 概要

- HTML5、CSS3、Vanilla JavaScript のみで実装
- 外部ライブラリ、外部API、外部データベースは不使用
- データはブラウザの `localStorage` に保存
- 下書き保存、履歴保存、編集、複製、削除、CSV出力、A4印刷に対応
- GitHub Pages で公開しやすいよう、公開ファイルはプロジェクト直下に配置

## ファイル構成

```text
ELF-Roast-Record-Final/
  index.html
  style.css
  script.js
  handwriting.html
  handwriting.css
  handwriting.js
  handwriting-sheet.pdf
  logo.png
  README.md
  .gitignore
```

## 使い方

`index.html` をブラウザで開くと使用できます。GitHub Pages へ公開する場合は、このフォルダの中身を公開対象にしてください。

保存データのキーは完成版専用です。

- 履歴: `elfRoastRecordFinal.v1`
- 下書き: `elfRoastRecordFinal.draft.v1`

過去の試作版や別アプリの保存データとは共有しません。

## 手書き用PDF

通常画面の「手書き用紙」ボタンは、A4横1ページの固定PDF `handwriting-sheet.pdf` を開きます。

PDFの元ファイルは `handwriting.html`、`handwriting.css`、`handwriting.js` です。レイアウトを変更した場合は、以下のようにChromeでPDFを再生成してください。

```bash
HTML_URL=$(python3 -c 'from pathlib import Path; print(Path("handwriting.html").resolve().as_uri())')

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless \
  --disable-gpu \
  --no-sandbox \
  --print-to-pdf=handwriting-sheet.pdf \
  "$HTML_URL"
```

生成後は以下でA4横1ページであることを確認します。

```bash
pdfinfo handwriting-sheet.pdf
```
