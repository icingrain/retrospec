import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const skills = ["code-inventory", "code-relationship", "sql-data-access", "quality-risk-scan", "custom-analysis-interview", "glossary-context", "ai-spec-analysis", "report-export"]
const parserBackedSkills = ["code-inventory", "code-relationship", "sql-data-access", "quality-risk-scan"]
const requiredLabels = ["EXTRACTED", "INFERRED", "AMBIGUOUS"]
const gapTaxonomy = ["bug", "unsupported", "ambiguous", "reference-missing"]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function pathExists(relativePath) {
  return existsSync(join(root, relativePath))
}

function readText(relativePath) {
  if (!pathExists(relativePath)) {
    fail(`missing artifact: ${relativePath}`)
  }
  return readFileSync(join(root, relativePath), "utf8")
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

function requireIncludes(relativePath, snippets) {
  const text = readText(relativePath)
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      fail(`${relativePath} missing required text: ${snippet}`)
    }
  }
  return text
}

function requireDirectory(relativePath) {
  if (!pathExists(relativePath)) {
    fail(`missing directory: ${relativePath}`)
  }
}

function requireRetrospecPath(value, label) {
  if (typeof value !== "string" || !value.startsWith(".retrospec/")) {
    fail(`${label} must stay under .retrospec/: ${String(value)}`)
  }
}

function parseList(value) {
  if (!value.startsWith("[") || !value.endsWith("]")) {
    return []
  }
  return value
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
}

function readFrontMatter(relativePath) {
  const text = readText(relativePath)
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) {
    fail(`${relativePath} missing SKILL.md front matter`)
  }
  const fields = new Map()
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":")
    if (separator === -1) {
      continue
    }
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  return fields
}

function requireFrontMatter(skill) {
  const relativePath = `skills/${skill}/SKILL.md`
  const expected = skillStandard[skill]
  const fields = readFrontMatter(relativePath)
  const requiredFrontMatterFields = ["name", "owner_agent", "categories", "origin", "trigger_examples", "template_path", "expected_writes", "refusal_boundary", "requires_generation_contract", "promoted_from", "created_by"]
  for (const field of requiredFrontMatterFields) {
    if (!fields.has(field)) {
      fail(`${relativePath} front matter missing ${field}`)
    }
  }
  if (fields.get("name") !== skill) fail(`${relativePath} front matter name mismatch`)
  if (fields.get("owner_agent") !== expected.owner_agent) fail(`${relativePath} owner_agent mismatch`)
  if (fields.get("origin") !== "core") fail(`${relativePath} origin must be core`)
  if (fields.get("template_path") !== expected.template_path) fail(`${relativePath} template_path mismatch`)
  if (fields.get("requires_generation_contract") !== expected.requires_generation_contract) {
    fail(`${relativePath} requires_generation_contract mismatch`)
  }
  for (const category of expected.categories) {
    if (!parseList(fields.get("categories") ?? "").includes(category)) fail(`${relativePath} missing category ${category}`)
  }
  for (const writePath of expected.expected_writes) {
    if (!parseList(fields.get("expected_writes") ?? "").includes(writePath)) fail(`${relativePath} missing expected write ${writePath}`)
    requireRetrospecPath(writePath, `${relativePath} expected write`)
  }
}

function requireJsonLines(relativePath, requiredSnippets) {
  const text = readText(relativePath).trim()
  if (text.length === 0) {
    fail(`${relativePath} must contain at least one JSONL row`)
  }
  for (const line of text.split("\n")) {
    JSON.parse(line)
  }
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      fail(`${relativePath} missing required text: ${snippet}`)
    }
  }
}

const config = readJson(".opencode/retrospec.jsonc")
const skillStandard = readJson("templates/state/skill-frontmatter-standard.json").skills
const policy = config.retrospec?.skill_load_policy
if (!policy) {
  fail(".opencode/retrospec.jsonc missing retrospec.skill_load_policy")
}

const configuredSkills = new Set([
  ...(policy.retro ?? []),
  ...(policy.spec ?? []),
  ...(policy.Archivist ?? []),
])
for (const skill of skills) {
  if (!configuredSkills.has(skill)) {
    fail(`skill_load_policy missing ${skill}`)
  }
}

const templatePaths = config.retrospec?.template_paths ?? {}
for (const relativePath of [templatePaths.retro, templatePaths.spec, templatePaths.report_export]) {
  requireDirectory(relativePath)
}

requireIncludes("skills/README.md", [
  "Skill load matrix",
  "Package structure contract",
  "Readiness checklist",
  "Minimum SKILL.md front matter",
  "Current package layout remains flat",
  "skills/<owner>/core|custom",
  "GET /analysis/status?project_path=<path>",
  "generation-contract.json",
  "validation-report.json",
  "reference-candidates.jsonl",
  "skill-promotion-candidates.jsonl",
  "approval_required",
  "auto_write_skills:false",
  "auto-merge",
  ...skills,
  ...requiredLabels,
  ...gapTaxonomy,
])

for (const skill of skills) {
  requireFrontMatter(skill)
  requireIncludes(`skills/${skill}/SKILL.md`, ["Runbook", "Inputs", "Outputs", "Failure handling"])
}

for (const skill of parserBackedSkills) {
  requireIncludes(`skills/${skill}/SKILL.md`, ["generated", "generation-contract.json", "validation-report.json"])
  requireIncludes(`skills/${skill}/references/parser-strategy.md`, ["fallback", "generated"])
  requireIncludes(`templates/retro/${skill}/prompt.md`, ["reference_pack", "generation-contract.json"])
}

requireIncludes("skills/sql-data-access/SKILL.md", ["proc-dynamic-sql-examples.md"])
requireIncludes("skills/sql-data-access/references/proc-dynamic-sql-examples.md", [
  "PREPARE",
  "EXECUTE IMMEDIATE",
  "unsupported_runtime_construction.pc",
])
requireIncludes("skills/glossary-context/SKILL.md", ["import-reconciliation.md", "No generated template"])
requireIncludes("skills/glossary-context/references/import-reconciliation.md", [
  ".retrospec/uploads/",
  ".retrospec/glossary/glossary.db",
  "No generated-template rationale",
])
requireIncludes("skills/custom-analysis-interview/SKILL.md", ["Surveyor", "no auto-promotion"])
requireIncludes("templates/retro/custom-analysis-interview/prompt.md", ["source sample", "generation-contract.json", "validation-report.json", "skill-promotion-candidates.jsonl", "approval_required:true", "auto_write_skills:false", "no auto-promotion"])
requireIncludes("skills/ai-spec-analysis/SKILL.md", ["Package layout", "templates/spec/ai-spec-analysis/"])
requireIncludes("skills/report-export/SKILL.md", ["Package layout", "templates/report-export/"])

requireIncludes("agents/retro/AGENT.md", [
  "GET /analysis/status?project_path=<path>",
  "skills/",
  ".retrospec/generated/retro/<skill>/",
  "validation-report.json",
  "reference-candidates.jsonl",
  "Appraiser",
  "Excavator",
])
requireIncludes("agents/spec/AGENT.md", [
  "GET /analysis/status?project_path=<path>",
  "ai-spec-analysis",
  "Curator",
  "AMBIGUOUS",
])
requireIncludes("agents/Archivist/AGENT.md", [
  "GET /analysis/status?project_path=<path>",
  "report-export",
  "glossary-context",
  ".retrospec/exports/",
])

for (const relativePath of [
  "templates/generated-program/README.md",
  "templates/generated-program/generation-contract.json",
  "templates/generated-program/job.json",
  "templates/generated-program/validation-report.json",
  "templates/generated-program/reference-candidates.jsonl",
  "templates/generated-program/skill-promotion-candidates.jsonl",
  "templates/retro/custom-analysis-interview/prompt.md",
]) {
  if (!pathExists(relativePath)) {
    fail(`missing generated-program template: ${relativePath}`)
  }
}

const generationContract = readJson("templates/generated-program/generation-contract.json")
if (generationContract.status_evidence?.checked !== true) {
  fail("generation-contract status_evidence.checked must be true")
}
for (const gap of gapTaxonomy) {
  if (!generationContract.validation_loop?.gap_taxonomy?.includes(gap)) {
    fail(`generation-contract validation_loop missing gap taxonomy ${gap}`)
  }
}
if (generationContract.validation_loop?.auto_merge_reference_candidates !== false) {
  fail("generation-contract must disable reference-candidate auto-merge")
}
requireRetrospecPath(generationContract.validation_loop?.report_path, "validation report path")
requireRetrospecPath(generationContract.validation_loop?.reference_candidates_path, "reference candidates path")

const job = readJson("templates/generated-program/job.json")
requireRetrospecPath(job.entrypoint, "generated job entrypoint")
for (const writePath of job.writes ?? []) {
  requireRetrospecPath(writePath, "generated job write path")
}

const validationReport = readJson("templates/generated-program/validation-report.json")
for (const field of ["samples", "expected_evidence", "generated_results", "comparisons", "gaps", "iterations"]) {
  if (!Array.isArray(validationReport[field])) {
    fail(`validation-report ${field} must be an array`)
  }
}
requireJsonLines("templates/generated-program/reference-candidates.jsonl", ["reference-missing", "reviewed-task-only", '"auto_merge":false'])
requireJsonLines("templates/generated-program/skill-promotion-candidates.jsonl", ["skill-promotion", '"approval_required":true', '"auto_write_skills":false'])

const dryRunFixture = readJson("templates/fixtures/skill-dry-run/phase8b6-cases.json")
if (!Array.isArray(dryRunFixture.cases) || dryRunFixture.cases.length < 10) {
  fail("Phase 8B.6 dry-run fixture must contain the expected case matrix")
}
readJson("templates/fixtures/sql-data-access/proc-dynamic-sql/expected-evidence.json")
readJson("templates/fixtures/code-inventory/c-cpp-java-symbols/expected-evidence.json")
readJson("templates/fixtures/code-relationship/c-java-calls/expected-evidence.json")
readJson("templates/fixtures/sql-data-access/jvm-data-access/expected-evidence.json")
readJson("templates/fixtures/quality-risk-scan/c-cpp-java-risk/expected-evidence.json")

for (const directory of ["templates/retro", "templates/spec/ai-spec-analysis", "templates/report-export"]) {
  const entries = readdirSync(join(root, directory))
  if (entries.length === 0) {
    fail(`${directory} must not be empty`)
  }
}

console.log(`skill readiness gate ok: ${skills.length} skills, 3 owner agents`)
