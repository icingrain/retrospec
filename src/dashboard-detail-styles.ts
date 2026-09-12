export const dashboardDetailStyles = `
      .detail-disclosure {
        margin-top: var(--space-4);
        border: 1px solid var(--border-subtle);
        background: var(--surface-elevated);
        padding: var(--space-4);
      }

      .detail-disclosure[open] {
        display: grid;
        gap: var(--space-4);
      }

      .detail-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
      }

      .detail-summary:focus-visible {
        outline: 2px solid var(--accent-primary);
        outline-offset: var(--space-1);
      }

      .detail-section-label {
        margin-top: var(--space-5);
      }
    `
