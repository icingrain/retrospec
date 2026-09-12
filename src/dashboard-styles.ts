export const dashboardStyles = `
      :root {
        --surface-primary: #F7F4ED;
        --surface-secondary: #FFFDF8;
        --surface-elevated: #FFFFFF;
        --text-primary: #1E1B16;
        --text-secondary: #665F52;
        --text-tertiary: #928879;
        --border-default: #DED6C8;
        --border-subtle: #EDE5D8;
        --accent-primary: #3B5B42;
        --accent-hover: #2D4533;
        --status-success: #23704A;
        --status-warning: #A66B14;
        --status-error: #A94438;
        --status-info: #35618D;
        --space-1: 4px;
        --space-2: 8px;
        --space-3: 12px;
        --space-4: 16px;
        --space-5: 20px;
        --space-6: 24px;
        --space-8: 32px;
        --space-10: 40px;
        --space-12: 48px;
        --space-16: 64px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100dvh;
        background: var(--surface-primary);
        color: var(--text-primary);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      a {
        color: var(--accent-primary);
      }

      a:hover {
        color: var(--accent-hover);
      }

      a:focus-visible,
      input:focus-visible {
        outline: 2px solid var(--accent-primary);
        outline-offset: var(--space-1);
      }

      .shell {
        width: min(1120px, calc(100% - var(--space-8)));
        margin: 0 auto;
        padding: var(--space-10) 0 var(--space-16);
      }

      .topbar,
      .card,
      .project-option {
        border: 1px solid var(--border-default);
        background: var(--surface-secondary);
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        gap: var(--space-4);
        align-items: center;
        padding: var(--space-4) var(--space-5);
      }

      .brand,
      .mono {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }

      .brand {
        font-size: 14px;
        font-weight: 700;
      }

	      .status-pill,
	      .status-summary,
	      .dashboard-action,
	      .state-chip {
	        display: inline-flex;
	        align-items: center;
        gap: var(--space-2);
        border: 1px solid var(--border-default);
        padding: var(--space-2) var(--space-3);
        font-size: 14px;
        font-weight: 700;
      }

	      .status-pill,
	      .dashboard-action,
	      .state-chip[data-state="available"],
	      .state-chip[data-state="ready_for_analysis"],
	      .state-chip[data-state="completed"],
	      .state-chip[data-state="high-confidence"] {
	        color: var(--status-success);
	      }

	      .dashboard-action {
	        margin-top: var(--space-3);
	        text-decoration: none;
	      }

      .status-summary {
        flex-wrap: wrap;
        gap: var(--space-3);
      }

      .status-summary p {
        max-width: 46ch;
      }

      .state-chip[data-state="deleted"],
      .state-chip[data-state="best-effort"] {
        color: var(--status-warning);
      }

	      .state-chip[data-state="unsupported"],
	      .state-chip[data-state="failed"] {
	        color: var(--status-error);
	      }

	      .hero {
	        padding: var(--space-12) 0 var(--space-10);
	      }

      .eyebrow {
        margin: 0 0 var(--space-3);
        color: var(--text-tertiary);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1,
      h2,
      h3,
      p {
        margin-top: 0;
      }

      h1 {
        max-width: 760px;
        margin-bottom: var(--space-4);
        font-size: clamp(36px, 7vw, 48px);
        line-height: 1.1;
        letter-spacing: -0.02em;
      }

      .lead {
        max-width: 720px;
        margin-bottom: 0;
        color: var(--text-secondary);
        font-size: 18px;
        line-height: 1.6;
      }

      .grid,
      .top-grid,
      .lower-grid,
      .project-facts,
      .project-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-4);
      }

      .top-grid,
      .lower-grid {
        min-width: 0;
      }

      .card,
      .project-option {
        padding: var(--space-6);
      }

      .card h2,
      .card h3,
      .project-option h3 {
        margin-bottom: var(--space-3);
      }

      .card h2 {
        font-size: 28px;
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .card h3,
      .project-option h3 {
        font-size: 22px;
        line-height: 1.4;
      }

      .card p,
      .project-option p {
        margin-bottom: 0;
        color: var(--text-secondary);
        font-size: 16px;
        line-height: 1.6;
      }

      .meta,
      .project-meta {
        margin-top: var(--space-5);
        padding-top: var(--space-4);
        border-top: 1px solid var(--border-subtle);
        color: var(--text-tertiary);
        font-size: 14px;
        overflow-wrap: anywhere;
      }

      .project-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .project-select {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .project-fact,
      .project-select,
      .project-option p,
      .project-warning {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .project-facts {
        margin-top: var(--space-4);
      }

      .project-fact {
        border: 1px solid var(--border-subtle);
        background: var(--surface-elevated);
        padding: var(--space-4);
      }

      .fact-label,
      .fact-value {
        display: block;
      }

      .fact-label {
        margin-bottom: var(--space-2);
        color: var(--text-tertiary);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .fact-value {
        color: var(--text-primary);
        font-size: 14px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .project-select input {
        margin-top: var(--space-2);
      }

      .project-warning {
        margin-top: var(--space-4);
        color: var(--status-warning);
        font-weight: 700;
      }

      @media (max-width: 640px) {
        .shell {
          width: min(100% - var(--space-4), 1120px);
          padding-top: var(--space-4);
        }

        .topbar {
          align-items: flex-start;
          flex-direction: column;
        }
      }

      @media (min-width: 768px) {
        .top-grid {
          grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
        }

        .lower-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .project-facts {
          grid-template-columns: minmax(0, 1fr) minmax(144px, 0.32fr);
        }

      }
    `
