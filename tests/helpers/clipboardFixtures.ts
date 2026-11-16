// Clipboard contents as real apps write them (text/plain + text/html), for the
// table paste tests. Trimmed copies of what each app puts on the clipboard,
// keeping the parts that matter: Excel's <style>, xl classes, <col> and
// same-cell <br>; Google Sheets' <google-sheets-html-origin> wrapper and inline
// styles; a web table with merged cells, a caption, no <thead> and a nested
// table; Word's list paragraphs; VS Code's styled <div>/<span> code.

/** Excel (Windows): a 3×2 range; "Note" of row 2 holds a line break (Alt+Enter). */
export const EXCEL = {
  text: 'Name\tQty\tNote\r\nApples\t3\t"red\nfresh"\r\n',
  html: `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<meta name=Generator content="Microsoft Excel 15">
<style>
<!--table
	{mso-displayed-decimal-separator:"\\,";
	mso-displayed-thousand-separator:"\\.";}
.xl65
	{mso-number-format:General;
	white-space:normal;}
-->
</style>
</head>
<body link="#0563C1" vlink="#954F72">
<table border=0 cellpadding=0 cellspacing=0 width=192 style='border-collapse:collapse;width:144pt'>
<!--StartFragment-->
 <col width=64 span=3 style='width:48pt'>
 <tr height=20 style='height:15.0pt'>
  <td height=20 class=xl65 width=64 style='height:15.0pt;width:48pt'>Name</td>
  <td class=xl65 width=64 style='width:48pt'>Qty</td>
  <td class=xl65 width=64 style='width:48pt'>Note</td>
 </tr>
 <tr height=40 style='height:30.0pt'>
  <td height=40 class=xl65 style='height:30.0pt'>Apples</td>
  <td align=right class=xl65>3</td>
  <td class=xl65 style='white-space:normal'>red<br style='mso-data-placement:same-cell' />fresh</td>
 </tr>
<!--EndFragment-->
</table>
</body>
</html>`,
}

/** Google Sheets: a 2×2 range, the number column right-aligned by inline styles. */
export const SHEETS = {
  text: 'Name\tQty\nPears\t7',
  html: '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>'
    + '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none" data-sheets-root="1">'
    + '<colgroup><col width="100"/><col width="100"/></colgroup><tbody>'
    + '<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">Name</td>'
    + '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;">Qty</td></tr>'
    + '<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">Pears</td>'
    + '<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:7}">7</td></tr>'
    + '</tbody></table></google-sheets-html-origin>',
}

/**
 * A table selected in a browser: caption, no <thead>, a rowspan and a colspan,
 * a <th> heading a body row, a table nested in a cell. Its text has ragged
 * rows (merged cells), so it isn't TSV: the HTML is what gets pasted.
 */
export const WEB_TABLE = {
  text: 'Fruit stock\nFruit\tStock\tPrice\nApple\tsold out\n5\t1.2\nTotal\t5\tx\ty',
  html: "<meta charset='utf-8'><table class=\"wikitable\"><caption>Fruit stock</caption><tbody>"
    + '<tr><td><b>Fruit</b></td><td>Stock</td><td>Price</td></tr>'
    + '<tr><td rowspan="2">Apple</td><td colspan="2">sold out</td></tr>'
    + '<tr><td>5</td><td>1.2</td></tr>'
    + '<tr><th>Total</th><td>5</td><td><table><tr><td>x</td><td>y</td></tr></table></td></tr>'
    + '</tbody></table>',
}

/** A numbered and a bulleted list copied from Word: "1.<tab>…" / "•<tab>…" text + MsoListParagraph HTML. */
export const WORD_LIST = {
  text: '1.\tFirst point\r\n2.\tSecond point\r\n•\tApples\r\n•\tPears\r\n',
  html: '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>p.MsoListParagraph {margin-left:36.0pt;}</style></head><body lang=ES>'
    + '<!--StartFragment--><p class=MsoListParagraphCxSpFirst style=\'text-indent:-18.0pt;mso-list:l0 level1 lfo1\'><![if !supportLists]><span>1.<span style=\'font:7.0pt "Times New Roman"\'>&nbsp;&nbsp;&nbsp; </span></span><![endif]>First point</p>'
    + '<p class=MsoListParagraphCxSpLast style=\'text-indent:-18.0pt;mso-list:l0 level1 lfo1\'><![if !supportLists]><span>2.<span>&nbsp;&nbsp;&nbsp; </span></span><![endif]>Second point</p>'
    + '<p class=MsoListParagraph style=\'text-indent:-18.0pt;mso-list:l1 level1 lfo2\'><![if !supportLists]><span style=\'font-family:Symbol\'>·<span>&nbsp;&nbsp;&nbsp; </span></span><![endif]>Apples</p>'
    + '<p class=MsoListParagraph style=\'text-indent:-18.0pt;mso-list:l1 level1 lfo2\'><![if !supportLists]><span style=\'font-family:Symbol\'>·<span>&nbsp;&nbsp;&nbsp; </span></span><![endif]>Pears</p><!--EndFragment--></body></html>',
}

/** Tab-indented code copied from VS Code: plain text + its styled <div>/<span> HTML. */
export const VSCODE_CODE = {
  text: 'function f() {\n\tif (a) {\n\t\treturn b\n\t}\n}',
  html: '<meta charset=\'utf-8\'><div style="color: #cccccc;background-color: #1f1f1f;font-family: Consolas, \'Courier New\', monospace;font-weight: normal;font-size: 14px;line-height: 19px;white-space: pre;">'
    + '<div><span style="color: #569cd6;">function</span><span style="color: #cccccc;"> </span><span style="color: #dcdcaa;">f</span><span style="color: #cccccc;">() {</span></div>'
    + '<div><span style="color: #cccccc;">&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="color: #c586c0;">if</span><span style="color: #cccccc;"> (</span><span style="color: #9cdcfe;">a</span><span style="color: #cccccc;">) {</span></div>'
    + '<div><span style="color: #cccccc;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="color: #c586c0;">return</span><span style="color: #cccccc;"> </span><span style="color: #9cdcfe;">b</span></div>'
    + '<div><span style="color: #cccccc;">&nbsp;&nbsp;&nbsp;&nbsp;}</span></div>'
    + '<div><span style="color: #cccccc;">}</span></div></div>',
}

/** A rectangular web table with a bold cell and a link: Chromium writes its text as TSV. */
export const WEB_FORMATTED = {
  text: 'Name\tSite\nBold\tlink',
  html: "<meta charset='utf-8'><table><tbody><tr><th>Name</th><th>Site</th></tr>"
    + '<tr><td><b>Bold</b></td><td><a href="https://e.com">link</a></td></tr></tbody></table>',
}

/**
 * A Google Docs table (TSV text too): wrapped in Docs' `<b style="font-weight:normal">`,
 * bold as an inline `font-weight:700` span, a link styled with `text-decoration:underline`.
 */
const DOCS_SPAN = 'font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-style:normal;font-variant:normal;vertical-align:baseline;white-space:pre;white-space:pre-wrap;'
const docsCell = (inner: string) => '<td style="border-left:solid #000000 1pt;border-right:solid #000000 1pt;vertical-align:top;padding:5pt 5pt 5pt 5pt;overflow:hidden;overflow-wrap:break-word;">'
  + `<p dir="ltr" style="line-height:1.2;margin-top:0pt;margin-bottom:0pt;">${inner}</p></td>`
export const DOCS_TABLE = {
  text: 'Name\tSite\nBold\tlink',
  html: '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d-7fff-1234-abcd-0123456789ab">'
    + '<div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;">'
    + '<colgroup><col width="301" /><col width="301" /></colgroup><tbody>'
    + '<tr style="height:0pt">'
    + docsCell(`<span style="${DOCS_SPAN}font-weight:400;text-decoration:none;">Name</span>`)
    + docsCell(`<span style="${DOCS_SPAN}font-weight:400;text-decoration:none;">Site</span>`)
    + '</tr><tr style="height:0pt">'
    + docsCell(`<span style="${DOCS_SPAN}font-weight:700;text-decoration:none;">Bold</span>`)
    + docsCell(`<a href="https://e.com" style="text-decoration:none;"><span style="${DOCS_SPAN}font-weight:400;color:#1155cc;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;">link</span></a>`)
    + '</tr></tbody></table></div></b>',
}

/** DOCS_TABLE as Docs often writes it: a `<br />` after the table, inside its `<b id="docs-internal-guid…">` wrapper. */
export const DOCS_TABLE_TRAILING_BR = {
  text: DOCS_TABLE.text,
  html: DOCS_TABLE.html.replace('</div></b>', '</div><br /></b>'),
}
