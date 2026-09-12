export const analysisConfidenceStyles = `
      .confidence-summary,
      .confidence-guide .project-facts {
        grid-template-columns: 1fr;
      }

      .confidence-list,
      .fallback-list {
        margin-top: var(--space-4);
      }

      .confidence-guide {
        margin-top: var(--space-4);
      }

      .fallback-evidence-card {
        margin-top: var(--space-4);
      }

      @media (min-width: 768px) {
        .confidence-summary,
        .confidence-guide .project-facts {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `
