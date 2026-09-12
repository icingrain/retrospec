import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { RetroExportFormat, TabularExport } from "./types"
import { toXlsxWorkbook } from "./xlsx-writer"

export async function writeTabularExports(
  exportsDir: string,
  format: RetroExportFormat,
  tables: readonly TabularExport[],
): Promise<void> {
  await Promise.all(
    tables.map((table) =>
      writeFile(join(exportsDir, `${table.category}.${format}`), serializeTable(table, format)),
    ),
  )
}

function serializeTable(table: TabularExport, format: RetroExportFormat): string | Uint8Array {
  switch (format) {
    case "csv":
      return toCsv(table)
    case "xlsx":
      return toXlsxWorkbook(table)
    default:
      return assertNever(format)
  }
}

function toCsv(table: TabularExport): string {
  const header = table.columns.join(",")
  const rows = table.rows.map((row) =>
    table.columns.map((column) => csvCell(row[column] ?? null)).join(","),
  )
  return `${[header, ...rows].join("\n")}\n`
}

function csvCell(value: string | number | null): string {
  if (value === null) {
    return ""
  }
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function assertNever(value: never): never {
  throw new Error(`Unexpected export format: ${String(value)}`)
}
