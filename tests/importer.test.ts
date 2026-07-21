import { vi, describe, expect, it } from "vitest";

vi.mock("obsidian", () => {
  class MockFile {
    public constructor(public path: string) {}
  }
  class MockFolder {
    public constructor(public path: string) {}
  }
  return {
    normalizePath: (value: string) => value.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
    TFile: MockFile,
    TFolder: MockFolder
  };
});

import { TFile, TFolder, type App, type CachedMetadata } from "obsidian";
import type { ChecklistProvider } from "../src/graph-client";
import { TaskImporter } from "../src/importer";
import type { ImportSelection, TodoTask, TodoTaskList } from "../src/types";

interface FakeVaultState {
  entries: Map<string, TFile | TFolder>;
  markdownFiles: TFile[];
  contents: Map<string, string>;
  frontmatter: Map<string, CachedMetadata>;
}

function createTask(id: string, title = "Task"): TodoTask {
  return {
    id,
    title,
    status: "notStarted",
    importance: "normal",
    createdDateTime: "2026-01-01T00:00:00.000Z"
  };
}

const list: TodoTaskList = { id: "list-1", displayName: "Arbeit" };

function createTestFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  return file;
}

function createTestFolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  return folder;
}

function createFakeApp(existing: Array<{ path: string; taskId?: string }> = []): {
  app: App;
  state: FakeVaultState;
} {
  const entries = new Map<string, TFile | TFolder>();
  const markdownFiles: TFile[] = [];
  const contents = new Map<string, string>();
  const frontmatter = new Map<string, CachedMetadata>();
  for (const item of existing) {
    const file = createTestFile(item.path);
    entries.set(item.path, file);
    markdownFiles.push(file);
    contents.set(item.path, "old content");
    if (item.taskId) {
      frontmatter.set(item.path, { frontmatter: { "ms-todo-task-id": item.taskId } });
    }
  }

  const vault = {
    getMarkdownFiles: () => markdownFiles,
    getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
    createFolder: (path: string) => {
      const folder = createTestFolder(path);
      entries.set(path, folder);
      return Promise.resolve(folder);
    },
    create: (path: string, content: string) => {
      const file = createTestFile(path);
      entries.set(path, file);
      markdownFiles.push(file);
      contents.set(path, content);
      return Promise.resolve(file);
    },
    process: (file: TFile, callback: (content: string) => string) => {
      contents.set(file.path, callback(contents.get(file.path) ?? ""));
      return Promise.resolve(contents.get(file.path) ?? "");
    }
  };
  const metadataCache = {
    getFileCache: (file: TFile) => frontmatter.get(file.path) ?? null
  };
  const fileManager = {
    renameFile: (file: TFile, path: string) => {
      const content = contents.get(file.path);
      const metadata = frontmatter.get(file.path);
      entries.delete(file.path);
      contents.delete(file.path);
      frontmatter.delete(file.path);
      file.path = path;
      entries.set(path, file);
      if (content !== undefined) contents.set(path, content);
      if (metadata !== undefined) frontmatter.set(path, metadata);
      return Promise.resolve();
    }
  };
  const state: FakeVaultState = { entries, markdownFiles, contents, frontmatter };
  return { app: { vault, metadataCache, fileManager } as unknown as App, state };
}

const checklistProvider: ChecklistProvider = {
  listOpenChecklistItems: vi.fn(() => Promise.resolve([]))
};

function selection(task: TodoTask): ImportSelection[] {
  return [{ list, tasks: [task] }];
}

describe("TaskImporter", () => {
  it("creates a new task note", async () => {
    const { app, state } = createFakeApp();
    const importer = new TaskImporter(app, checklistProvider, () => "Microsoft To Do");
    const summary = await importer.importTasks(selection(createTask("new-id")), [list]);
    expect(summary.created).toBe(1);
    expect(state.contents.has("Microsoft To Do/Arbeit/Task.md")).toBe(true);
  });

  it("renames, moves and completely updates a matching note", async () => {
    const { app, state } = createFakeApp([{ path: "Alt/Alter Name.md", taskId: "same-id" }]);
    const importer = new TaskImporter(app, checklistProvider, () => "Microsoft To Do");
    const summary = await importer.importTasks(selection(createTask("same-id", "Neuer Name")), [list]);
    expect(summary.updated).toBe(1);
    expect(state.entries.has("Microsoft To Do/Arbeit/Neuer Name.md")).toBe(true);
    expect(state.contents.get("Microsoft To Do/Arbeit/Neuer Name.md")).toContain("ms-todo-task-id");
    expect(state.contents.get("Microsoft To Do/Arbeit/Neuer Name.md")).not.toBe("old content");
  });

  it("skips duplicate task-id conflicts", async () => {
    const { app } = createFakeApp([
      { path: "A.md", taskId: "duplicate-id" },
      { path: "B.md", taskId: "duplicate-id" }
    ]);
    const importer = new TaskImporter(app, checklistProvider, () => "Microsoft To Do");
    const summary = await importer.importTasks(selection(createTask("duplicate-id")), [list]);
    expect(summary.conflicts).toBe(1);
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it("uses a stable suffix for an unrelated filename collision", async () => {
    const { app } = createFakeApp([{ path: "Microsoft To Do/Arbeit/Task.md" }]);
    const importer = new TaskImporter(app, checklistProvider, () => "Microsoft To Do");
    const summary = await importer.importTasks(selection(createTask("collision-id")), [list]);
    expect(summary.items[0]?.path).toMatch(/^Microsoft To Do\/Arbeit\/Task \([a-z0-9]{7}\)\.md$/);
  });
});
