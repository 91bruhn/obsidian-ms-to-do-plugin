import { describe, expect, it, vi } from "vitest";
import { createTaskMarkdown } from "../src/markdown";
import type { ChecklistItem, TodoTask } from "../src/types";

const task: TodoTask = {
  id: "task/id=1",
  title: "Angebot vorbereiten",
  status: "notStarted",
  importance: "high",
  createdDateTime: "2026-07-09T02:07:52.536Z",
  body: { content: "Zeile 1\nZeile 2", contentType: "text" }
};

const checklistItems: ChecklistItem[] = [
  { id: "open", displayName: "Entwurf erstellen", isChecked: false },
  { id: "done", displayName: "Erledigt", isChecked: true }
];

describe("createTaskMarkdown", () => {
  it("creates exact YAML and optional sections", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-120);
    expect(createTaskMarkdown(task, "list/id=1", checklistItems)).toBe(`---
ms-todo-task-id: "task/id=1"
ms-todo-list-id: "list/id=1"
dateCreated: 2026-07-09T04:07:52.536+02:00
priority: high
status: none
tags:
  - ms-todo
  - task
---

# Teilaufgaben

- Entwurf erstellen

# Notizen

Zeile 1
Zeile 2
`);
    vi.restoreAllMocks();
  });

  it("omits empty sections and maps non-high importance to low", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
    const minimalTask: TodoTask = {
      ...task,
      importance: "normal",
      body: { content: "   ", contentType: "text" }
    };
    const markdown = createTaskMarkdown(minimalTask, "list", []);
    expect(markdown).toContain("priority: low");
    expect(markdown).not.toContain("# Teilaufgaben");
    expect(markdown).not.toContain("# Notizen");
    vi.restoreAllMocks();
  });

  it("keeps HTML notes unchanged", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
    const htmlTask: TodoTask = {
      ...task,
      body: { content: "<p><strong>Wichtig</strong></p>", contentType: "html" }
    };
    expect(createTaskMarkdown(htmlTask, "list", [])).toContain("<p><strong>Wichtig</strong></p>");
    vi.restoreAllMocks();
  });
});
