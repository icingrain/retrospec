export class SpecTemplateValidationError extends Error {
  readonly blockers: readonly string[]

  constructor(templateId: string, blockers: readonly string[]) {
    super(`spec template ${templateId} is blocked: ${blockers.join(", ")}`)
    this.name = "SpecTemplateValidationError"
    this.blockers = blockers
  }
}
