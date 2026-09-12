export const retrospecConfigDefaults = {
  mode: "daemon-first",
  skills_path: "skills/",
  skill_load_policy: {
    retro: [
      "code-inventory",
      "code-relationship",
      "sql-data-access",
      "quality-risk-scan",
      "custom-analysis-interview",
    ],
    spec: ["ai-spec-analysis"],
    Archivist: ["report-export", "glossary-context"],
  },
  template_paths: {
    retro: "templates/retro/",
    spec: "templates/spec/ai-spec-analysis/",
    report_export: "templates/report-export/",
  },
  hooks_enabled: true,
  disabled_hooks: [],
  required_policy: [
    "session-start-health-status-hint",
    "tool-write-guard-retrospec-boundary",
    "agent-minimal-status-first-reminder",
    "agent-decision-openCode-conversation-line",
  ],
  optional_policy: [
    "report-export-complete-notification",
    "dashboard-open-hint",
    "long-running-job-continuation-reminder",
  ],
  forbidden_policy: [
    "hooks-must-not-run-analysis",
    "hooks-must-not-submit-jobs-without-agent-approval",
    "hooks-must-not-mutate-job-ledger-or-analysis-state",
  ],
} as const
