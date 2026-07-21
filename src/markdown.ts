import { formatLocalIsoDateTime } from "./date-format";
import type { ChecklistItem, TodoTask } from "./types";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function formatBullet(value: string): string {
  return `- ${value.replace(/\r?\n/g, "\n  ")}`;
}

export function createTaskMarkdown(
  task: TodoTask,
  listId: string,
  checklistItems: readonly ChecklistItem[]
): string {
  const frontmatter = [
    "---",
    `ms-todo-task-id: ${yamlString(task.id)}`,
    `ms-todo-list-id: ${yamlString(listId)}`,
    `dateCreated: ${formatLocalIsoDateTime(task.createdDateTime)}`,
    `priority: ${task.importance === "high" ? "high" : "low"}`,
    "status: none",
    "tags:",
    "  - ms-todo",
    "  - task",
    "---"
  ].join("\n");

  const sections: string[] = [];
  const openChecklistItems = checklistItems.filter((item) => !item.isChecked);
  if (openChecklistItems.length > 0) {
    sections.push(
      ["# Teilaufgaben", "", ...openChecklistItems.map((item) => formatBullet(item.displayName))].join("\n")
    );
  }

  const noteContent = task.body?.content ?? "";
  if (noteContent.trim().length > 0) {
    sections.push(["# Notizen", "", noteContent].join("\n"));
  }

  return sections.length > 0
    ? `${frontmatter}\n\n${sections.join("\n\n")}\n`
    : `${frontmatter}\n`;
}
