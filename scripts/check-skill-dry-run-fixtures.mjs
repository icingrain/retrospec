import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const fixturePath = join(root, "templates/fixtures/skill-dry-run/phase8b6-cases.json")
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"))
const expectedEvidencePacks = [
  "templates/fixtures/code-inventory/c-cpp-java-symbols/expected-evidence.json",
  "templates/fixtures/code-relationship/c-java-calls/expected-evidence.json",
  "templates/fixtures/sql-data-access/jvm-data-access/expected-evidence.json",
  "templates/fixtures/sql-data-access/proc-dynamic-sql/expected-evidence.json",
  "templates/fixtures/quality-risk-scan/c-cpp-java-risk/expected-evidence.json",
]

const requiredKinds = [
  "happy_path",
  "fallback_refusal",
  "source_fit_generated_program",
  "validation_loop",
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`)
  }
}

if (!Array.isArray(fixture.cases)) {
  fail("fixture cases must be an array")
}

for (const kind of requiredKinds) {
  const expected = fixture.required_counts?.[kind]
  if (typeof expected !== "number") {
    fail(`missing required count for ${kind}`)
  }
  const actual = fixture.cases.filter((entry) => entry.kind === kind).length
  if (actual < expected) {
    fail(`${kind} requires ${expected} cases, found ${actual}`)
  }
}

for (const entry of fixture.cases) {
  requireString(entry.id, "case id")
  requireString(entry.kind, `${entry.id}.kind`)
  requireString(entry.owner_agent, `${entry.id}.owner_agent`)
  requireString(entry.skill, `${entry.id}.skill`)
  requireString(entry.expected_decision, `${entry.id}.expected_decision`)
  if (!Array.isArray(entry.must_read) || entry.must_read.length === 0) {
    fail(`${entry.id}.must_read must name referenced artifacts`)
  }
  for (const relativePath of entry.must_read) {
    if (!existsSync(join(root, relativePath))) {
      fail(`${entry.id} references missing artifact ${relativePath}`)
    }
  }
}

const generationContract = JSON.parse(
  readFileSync(join(root, "templates/generated-program/generation-contract.json"), "utf8"),
)
const validationLoop = generationContract.validation_loop
if (!validationLoop?.required || validationLoop.auto_merge_reference_candidates !== false) {
  fail("generation-contract validation_loop must require validation and disable auto-merge")
}

JSON.parse(readFileSync(join(root, "templates/generated-program/validation-report.json"), "utf8"))

const referenceCandidates = readFileSync(
  join(root, "templates/generated-program/reference-candidates.jsonl"),
  "utf8",
).trim()
for (const line of referenceCandidates.split("\n")) {
  JSON.parse(line)
}

const skillPromotionCandidates = readFileSync(
  join(root, "templates/generated-program/skill-promotion-candidates.jsonl"),
  "utf8",
).trim()
for (const line of skillPromotionCandidates.split("\n")) {
  const candidate = JSON.parse(line)
  if (candidate.approval_required !== true || candidate.auto_write_skills !== false) {
    fail("skill-promotion-candidates.jsonl must require approval and disable skill writes")
  }
}

for (const relativePath of expectedEvidencePacks) {
  JSON.parse(readFileSync(join(root, relativePath), "utf8"))
}

console.log(`skill dry-run fixtures ok: ${fixture.cases.length} cases`)
