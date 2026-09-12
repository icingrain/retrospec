import { describe, expect, test } from "bun:test"
import { renderDashboardExportsPage } from "../src/dashboard-exports"

describe("dashboard export previews", () => {
  test("Given graph exports with preview text When dashboard exports page renders Then lightweight graph previews are visible", () => {
    const html = renderDashboardExportsPage({
      selectedProjectPath: "/tmp/retrospec-demo",
      exports: [
        {
          file_id: "call_graph_mermaid",
          file_name: "call_graph.mmd",
          format: "mermaid",
          size_bytes: 72,
          created_at: "2026-07-26T00:00:00.000Z",
          download_url: "/exports/call_graph_mermaid/download",
          preview: {
            title: "Mermaid sequence preview",
            summary: "Sequence diagram source from call graph candidates.",
            source: "sequenceDiagram\n  sym_controller->>sym_service: call\n",
            facts: ["sym_controller->>sym_service: call"],
          },
        },
        {
          file_id: "call_graph_graphml",
          file_name: "call_graph.graphml",
          format: "graphml",
          size_bytes: 180,
          created_at: "2026-07-26T00:00:00.000Z",
          download_url: "/exports/call_graph_graphml/download",
          preview: {
            title: "GraphML preview",
            summary: "Open in Gephi or yEd for full graph inspection.",
            source: '<graphml><node id="sym_controller"/></graphml>',
            facts: ["1 nodes", "0 edges"],
          },
        },
      ],
    })

    expect(html).toContain("Export preview")
    expect(html).toContain("Mermaid sequence preview")
    expect(html).toContain("sym_controller-&gt;&gt;sym_service: call")
    expect(html).toContain("Open in Gephi or yEd")
  })
})
