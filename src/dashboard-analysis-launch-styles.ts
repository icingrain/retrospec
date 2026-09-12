export const analysisLaunchStyles = `
      .analysis-launch {
        grid-column: 1 / -1;
      }

	      .launch-grid,
	      .scope-mode-grid,
	      .folder-tree,
	      .scope-exclusion-settings,
	      .template-picker,
	      .provider-picker,
	      .launch-execution-settings,
	      .provider-settings-fields {
	        display: grid;
	        grid-template-columns: 1fr;
	        gap: var(--space-4);
	      }

      .launch-grid {
        margin-top: var(--space-5);
      }

	      .scope-mode-grid,
	      .scope-exclusion-settings,
	      .template-picker,
	      .provider-picker,
	      .launch-execution-settings,
	      .provider-settings-fields {
	        margin-top: var(--space-4);
	      }

	      .provider-field {
	        display: grid;
	        gap: var(--space-2);
	        color: var(--text-secondary);
	        font-size: 14px;
	      }

	      .provider-field input,
	      .provider-field textarea {
	        border: 1px solid var(--border-subtle);
	        background: var(--surface-secondary);
	        color: var(--text-primary);
	        padding: var(--space-2) var(--space-3);
	        font: inherit;
	      }

	      .provider-field textarea {
	        resize: vertical;
	      }

	      .provider-field input:focus-visible,
	      .provider-field textarea:focus-visible {
	        outline: 2px solid var(--accent-primary);
	        outline-offset: var(--space-1);
	      }

	      .provider-field[hidden] {
	        display: none;
	      }

      .launch-fieldset {
        border: 1px solid var(--border-subtle);
        background: var(--surface-elevated);
        padding: var(--space-4);
      }

      .launch-fieldset legend {
        color: var(--text-tertiary);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .launch-choice,
      .folder-node-summary {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        color: var(--text-primary);
        font-size: 14px;
        line-height: 1.5;
      }

      .launch-choice span,
      .folder-node-label {
        display: block;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .launch-choice small,
      .folder-node-label small {
        display: block;
        color: var(--text-tertiary);
      }

      .folder-tree {
        margin-top: var(--space-4);
      }

      .folder-root-state,
      .folder-node-summary {
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.5;
      }

      .folder-root-state {
        border: 1px solid var(--border-subtle);
        background: var(--surface-secondary);
        padding: var(--space-3);
      }

      .folder-node {
        min-width: 0;
      }

      .folder-node + .folder-node {
        margin-top: var(--space-2);
      }

      .folder-node-summary {
        cursor: pointer;
        overflow-wrap: anywhere;
      }

      .folder-node-summary::marker {
        content: "";
      }

      .folder-disclosure,
      .folder-disclosure-spacer {
        flex: 0 0 var(--space-3);
        width: var(--space-3);
        height: var(--space-3);
        margin-top: var(--space-1);
      }

      .folder-disclosure {
        border-right: 1px solid var(--text-tertiary);
        border-bottom: 1px solid var(--text-tertiary);
        transform: rotate(-45deg);
        transition: transform 120ms ease-out;
      }

      details[open] > summary .folder-disclosure {
        transform: rotate(45deg);
      }

      .folder-tree:disabled .folder-node-summary {
        cursor: not-allowed;
        color: var(--text-tertiary);
      }

      .folder-node-summary input[type="checkbox"]:indeterminate {
        accent-color: var(--text-tertiary);
      }

      .folder-children {
        margin: var(--space-2) 0 0 var(--space-6);
        padding-left: var(--space-4);
        border-left: 1px solid var(--border-subtle);
      }

	      .existing-result-notice,
	      .auto-retro-input,
		      .saved-scope-status,
		      .launch-execution-summary,
		      .provider-secret-note,
		      .launch-settings-actions {
	        margin-top: var(--space-4);
	      }

	      .launch-settings-actions {
	        display: flex;
	        flex-wrap: wrap;
	        gap: var(--space-3);
	      }

	      .provider-secret-note {
	        margin-top: var(--space-3);
	      }

	      .scope-save-actions,
	      .provider-save-actions {
	        justify-content: flex-end;
	      }

	      .launch-settings-button {
	        border: 1px solid var(--border-strong);
	        background: var(--text-primary);
	        color: var(--surface-primary);
	        padding: var(--space-2) var(--space-4);
	        font: inherit;
	        cursor: pointer;
	      }

      .provider-disabled {
        color: var(--text-tertiary);
      }

      select:focus-visible {
        outline: 2px solid var(--accent-primary);
        outline-offset: var(--space-1);
      }

      @media (min-width: 768px) {
        .launch-grid {
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        }
      }
    `
