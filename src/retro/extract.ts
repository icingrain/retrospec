import { readFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { RetroFileRecord, RetroInventory, RetroSymbolRecord } from "../types"
import {
  coverageSummary,
  evidenceForLanguage,
  extractGenericSymbols,
  highConfidenceEvidence,
  visibilityFromLine,
} from "./extraction-substrate"
import { createEntityId } from "./ids"
import type { SurveyResult } from "./survey"

export async function extractInventory(survey: SurveyResult): Promise<RetroInventory> {
  const files: RetroFileRecord[] = []
  const symbols: RetroSymbolRecord[] = []

  for (const file of survey.files) {
    const content = await readFile(file.absolutePath, "utf8")
    const fileEntityId = createEntityId(file.relativePath, "file")
    files.push({
      entity_id: fileEntityId,
      file_path: file.relativePath,
      language: file.language,
      loc: countLines(content),
      size_bytes: file.sizeBytes,
      module_name: dirname(file.relativePath),
      content_hash: file.contentHash,
      evidence: evidenceForLanguage(file.language),
    })
    symbols.push(...extractSymbols(file.relativePath, file.language, fileEntityId, content))
  }

  return {
    files,
    symbols,
    sourceFingerprint: survey.sourceFingerprint,
    analysisScope: survey.analysisScope,
    coverageSummaryJson: coverageSummary(files, symbols),
  }
}

function extractSymbols(
  filePath: string,
  language: string,
  fileEntityId: string,
  content: string,
): readonly RetroSymbolRecord[] {
  if (language === "java") {
    return extractJavaSymbols(filePath, fileEntityId, content)
  }

  if (language === "c") {
    return extractCSymbols(filePath, fileEntityId, content)
  }

  return extractGenericSymbols(filePath, language, fileEntityId, content)
}

function extractJavaSymbols(
  filePath: string,
  fileEntityId: string,
  content: string,
): readonly RetroSymbolRecord[] {
  const symbols: RetroSymbolRecord[] = []
  const lines = content.split("\n")
  let classEntityId: string | null = null

  for (const [index, line] of lines.entries()) {
    const classMatch = /\b(class|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line)
    if (classMatch !== null) {
      const name = classMatch[2]
      if (name === undefined) {
        continue
      }
      classEntityId = createEntityId(filePath, name, "class")
      symbols.push({
        entity_id: classEntityId,
        parent_entity_id: fileEntityId,
        symbol_type: "class",
        name,
        signature: line.trim(),
        start_line: index + 1,
        end_line: index + 1,
        visibility: visibilityFromLine(line),
        file_path: filePath,
        evidence: highConfidenceEvidence,
      })
      continue
    }

    const methodMatch =
      /\b(public|private|protected)?\s*(?:static\s+)?[A-Za-z_][A-Za-z0-9_<>,\[\]]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{/.exec(
        line,
      )
    if (methodMatch !== null) {
      const name = methodMatch[2]
      if (name === undefined) {
        continue
      }
      symbols.push({
        entity_id: createEntityId(filePath, name, line.trim()),
        parent_entity_id: classEntityId ?? fileEntityId,
        symbol_type: "method",
        name,
        signature: line.trim(),
        start_line: index + 1,
        end_line: index + 1,
        visibility: visibilityFromLine(line),
        file_path: filePath,
        evidence: highConfidenceEvidence,
      })
    }
  }

  return symbols
}

function extractCSymbols(
  filePath: string,
  fileEntityId: string,
  content: string,
): readonly RetroSymbolRecord[] {
  const symbols: RetroSymbolRecord[] = []
  const lines = content.split("\n")

  for (const [index, line] of lines.entries()) {
    const functionMatch =
      /^\s*[A-Za-z_][A-Za-z0-9_\s\*]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{/.exec(line)
    if (functionMatch === null) {
      continue
    }

    const name = functionMatch[1]
    if (name === undefined) {
      continue
    }
    symbols.push({
      entity_id: createEntityId(filePath, name, line.trim()),
      parent_entity_id: fileEntityId,
      symbol_type: "function",
      name,
      signature: line.trim(),
      start_line: index + 1,
      end_line: index + 1,
      visibility: line.includes("static") ? "private" : "public",
      file_path: filePath,
      evidence: highConfidenceEvidence,
    })
  }

  return symbols
}

function countLines(content: string): number {
  return content.split("\n").filter((line) => line.trim().length > 0).length
}
