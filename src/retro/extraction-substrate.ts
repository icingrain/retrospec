import type { RetroFileRecord, RetroSymbolRecord, SourceExtractionEvidence } from "../types"
import { createEntityId } from "./ids"

type GenericPattern = {
  readonly symbolType: string
  readonly expression: RegExp
}

export const highConfidenceEvidence: SourceExtractionEvidence = {
  parserBackend: "builtin-regex",
  parserMode: "regex",
  supportLevel: "high-confidence",
  evidenceLabel: "EXTRACTED",
  missingCapability: null,
}

const genericAstEvidence: SourceExtractionEvidence = {
  parserBackend: "generic-ast-substrate",
  parserMode: "generic_ast",
  supportLevel: "best-effort",
  evidenceLabel: "INFERRED",
  missingCapability: "language-specific-reference-pack",
}

const scriptPatterns: readonly GenericPattern[] = [
  {
    symbolType: "function",
    expression: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
  },
  {
    symbolType: "function",
    expression:
      /^\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
  },
  {
    symbolType: "class",
    expression: /^\s*(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/,
  },
]

const genericPatternsByLanguage: Record<string, readonly GenericPattern[]> = {
  cpp: [
    {
      symbolType: "function",
      expression:
        /^\s*[A-Za-z_][A-Za-z0-9_:<>\s\*&]*\s+([A-Za-z_][A-Za-z0-9_:]*)\s*\([^;]*\)\s*(?:const\s*)?\{/,
    },
  ],
  javascript: scriptPatterns,
  proc: [
    {
      symbolType: "function",
      expression: /^\s*[A-Za-z_][A-Za-z0-9_\s\*]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{/,
    },
  ],
  python: [
    { symbolType: "function", expression: /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/ },
    { symbolType: "class", expression: /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/ },
  ],
  typescript: scriptPatterns,
  tsx: scriptPatterns,
}

export function extractGenericSymbols(
  filePath: string,
  language: string,
  fileEntityId: string,
  content: string,
): readonly RetroSymbolRecord[] {
  const patterns = genericPatternsByLanguage[language] ?? []
  const symbols: RetroSymbolRecord[] = []
  const lines = content.split("\n")

  for (const [index, line] of lines.entries()) {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(line)
      const name = match?.[1]
      if (name === undefined) {
        continue
      }
      symbols.push({
        entity_id: createEntityId(filePath, name, line.trim()),
        parent_entity_id: fileEntityId,
        symbol_type: pattern.symbolType,
        name,
        signature: line.trim(),
        start_line: index + 1,
        end_line: index + 1,
        visibility: visibilityFromLine(line),
        file_path: filePath,
        evidence: genericAstEvidence,
      })
      break
    }
  }

  return symbols
}

export function evidenceForLanguage(language: string): SourceExtractionEvidence {
  if (language === "c" || language === "java") {
    return highConfidenceEvidence
  }
  return genericAstEvidence
}

export function coverageSummary(
  files: readonly RetroFileRecord[],
  symbols: readonly RetroSymbolRecord[],
): string {
  const languages = [...new Set(files.map((file) => file.language))].toSorted()
  const modes = [...new Set(files.map((file) => file.evidence?.parserMode ?? "regex"))].toSorted()
  return JSON.stringify({ files: files.length, symbols: symbols.length, languages, modes })
}

export function visibilityFromLine(line: string): string | null {
  if (line.includes("public")) {
    return "public"
  }
  if (line.includes("private")) {
    return "private"
  }
  if (line.includes("protected")) {
    return "protected"
  }
  return null
}
