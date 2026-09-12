import type { TabularExport } from "./types"
import { createStoredZip, encodeUtf8 } from "./zip-store"

export function toXlsxWorkbook(table: TabularExport): Uint8Array {
  return createStoredZip([
    { name: "[Content_Types].xml", bytes: encodeUtf8(contentTypesXml()) },
    { name: "_rels/.rels", bytes: encodeUtf8(packageRelationshipsXml()) },
    { name: "xl/workbook.xml", bytes: encodeUtf8(workbookXml(table.category)) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encodeUtf8(workbookRelationshipsXml()) },
    { name: "xl/worksheets/sheet1.xml", bytes: encodeUtf8(worksheetXml(table)) },
  ])
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
}

function packageRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
}

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlAttribute(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
}

function worksheetXml(table: TabularExport): string {
  const rows = [
    table.columns,
    ...table.rows.map((row) => table.columns.map((column) => row[column] ?? null)),
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${rows.map((row, index) => worksheetRow(row, index + 1)).join("\n")}
  </sheetData>
</worksheet>`
}

function worksheetRow(values: readonly (string | number | null)[], rowNumber: number): string {
  return `    <row r="${rowNumber}">${values
    .map((value, index) => worksheetCell(value, `${columnName(index + 1)}${rowNumber}`))
    .join("")}</row>`
}

function worksheetCell(value: string | number | null, reference: string): string {
  if (typeof value === "number") {
    return `<c r="${reference}"><v>${value}</v></c>`
  }
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlText(value ?? "")}</t></is></c>`
}

function columnName(index: number): string {
  let current = index
  let name = ""
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}

function xmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function xmlAttribute(value: string): string {
  return xmlText(value).replaceAll('"', "&quot;")
}
