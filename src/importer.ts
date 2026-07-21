import { normalizePath, TFile, TFolder, type App } from "obsidian";
import type { ChecklistProvider } from "./graph-client";
import { createTaskMarkdown } from "./markdown";
import { sanitizePathSegment, withStableSuffix } from "./path-utils";
import { isRecord } from "./type-guards";
import type {
  ImportResultItem,
  ImportSelection,
  ImportSummary,
  TodoTask,
  TodoTaskList
} from "./types";

const TASK_ID_PROPERTY = "ms-todo-task-id";

type ImportedNoteIndex = Map<string, TFile[]>;

export type ImportProgressCallback = (completed: number, total: number, taskTitle: string) => void;

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler";
}

function createEmptySummary(): ImportSummary {
  return { created: 0, updated: 0, conflicts: 0, errors: 0, items: [] };
}

function incrementSummary(summary: ImportSummary, item: ImportResultItem): void {
  summary.items.push(item);
  switch (item.status) {
    case "created":
      summary.created += 1;
      break;
    case "updated":
      summary.updated += 1;
      break;
    case "conflict":
      summary.conflicts += 1;
      break;
    case "error":
      summary.errors += 1;
      break;
  }
}

export class TaskImporter {
  public constructor(
    private readonly app: App,
    private readonly checklistProvider: ChecklistProvider,
    private readonly getImportRoot: () => string
  ) {}

  public getImportedTaskIdCounts(): Map<string, number> {
    const index = this.buildImportedNoteIndex();
    return new Map([...index.entries()].map(([id, files]) => [id, files.length]));
  }

  public async importTasks(
    selections: readonly ImportSelection[],
    allLists: readonly TodoTaskList[],
    onProgress?: ImportProgressCallback
  ): Promise<ImportSummary> {
    const root = this.validateImportRoot();
    await this.ensureFolder(root);
    const index = this.buildImportedNoteIndex();
    const listFolderNames = this.createListFolderNames(allLists);
    const summary = createEmptySummary();
    const total = selections.reduce((count, selection) => count + selection.tasks.length, 0);
    let completed = 0;

    for (const selection of selections) {
      const listFolderName = listFolderNames.get(selection.list.id) ?? this.getBaseListFolderName(selection.list);
      const listFolderPath = normalizePath(`${root}/${listFolderName}`);
      await this.ensureFolder(listFolderPath);

      for (const task of selection.tasks) {
        try {
          const item = await this.importOneTask(index, listFolderPath, selection.list, task);
          incrementSummary(summary, item);
        } catch (error: unknown) {
          incrementSummary(summary, {
            taskId: task.id,
            taskTitle: task.title,
            status: "error",
            message: messageFromError(error)
          });
        }
        completed += 1;
        onProgress?.(completed, total, task.title);
      }
    }
    return summary;
  }

  private async importOneTask(
    index: ImportedNoteIndex,
    listFolderPath: string,
    list: TodoTaskList,
    task: TodoTask
  ): Promise<ImportResultItem> {
    const matches = index.get(task.id) ?? [];
    if (matches.length > 1) {
      return {
        taskId: task.id,
        taskTitle: task.title,
        status: "conflict",
        message: `Die Task-ID ist in ${matches.length} Notes vorhanden.`
      };
    }

    const checklistItems = await this.checklistProvider.listOpenChecklistItems(list.id, task.id);
    const markdown = createTaskMarkdown(task, list.id, checklistItems);
    const existingFile = matches[0];
    const targetPath = this.findAvailableTaskPath(listFolderPath, task, existingFile);

    if (existingFile) {
      if (existingFile.path !== targetPath) {
        await this.app.fileManager.renameFile(existingFile, targetPath);
      }
      await this.app.vault.process(existingFile, () => markdown);
      index.set(task.id, [existingFile]);
      return {
        taskId: task.id,
        taskTitle: task.title,
        status: "updated",
        path: existingFile.path
      };
    }

    const createdFile = await this.app.vault.create(targetPath, markdown);
    index.set(task.id, [createdFile]);
    return {
      taskId: task.id,
      taskTitle: task.title,
      status: "created",
      path: createdFile.path
    };
  }

  private buildImportedNoteIndex(): ImportedNoteIndex {
    const index: ImportedNoteIndex = new Map();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!isRecord(frontmatter)) {
        continue;
      }
      const id = frontmatter[TASK_ID_PROPERTY];
      if (typeof id !== "string" || id.length === 0) {
        continue;
      }
      const entries = index.get(id) ?? [];
      entries.push(file);
      index.set(id, entries);
    }
    return index;
  }

  private createListFolderNames(lists: readonly TodoTaskList[]): Map<string, string> {
    const baseNames = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const list of lists) {
      const baseName = this.getBaseListFolderName(list);
      baseNames.set(list.id, baseName);
      counts.set(baseName.toLocaleLowerCase(), (counts.get(baseName.toLocaleLowerCase()) ?? 0) + 1);
    }

    return new Map(
      lists.map((list) => {
        const baseName = baseNames.get(list.id) ?? this.getBaseListFolderName(list);
        const duplicate = (counts.get(baseName.toLocaleLowerCase()) ?? 0) > 1;
        return [list.id, duplicate ? withStableSuffix(baseName, list.id) : baseName];
      })
    );
  }

  private getBaseListFolderName(list: TodoTaskList): string {
    return sanitizePathSegment(list.displayName, "Unbenannte Liste");
  }

  private findAvailableTaskPath(folderPath: string, task: TodoTask, currentFile?: TFile): string {
    const baseName = sanitizePathSegment(task.title, "Unbenannter Task");
    const preferredPath = normalizePath(`${folderPath}/${baseName}.md`);
    const preferredEntry = this.app.vault.getAbstractFileByPath(preferredPath);
    if (!preferredEntry || preferredEntry === currentFile) {
      return preferredPath;
    }

    const suffixedName = withStableSuffix(baseName, task.id);
    const suffixedPath = normalizePath(`${folderPath}/${suffixedName}.md`);
    const suffixedEntry = this.app.vault.getAbstractFileByPath(suffixedPath);
    if (!suffixedEntry || suffixedEntry === currentFile) {
      return suffixedPath;
    }

    let counter = 2;
    while (true) {
      const candidate = normalizePath(`${folderPath}/${suffixedName} ${counter}.md`);
      const entry = this.app.vault.getAbstractFileByPath(candidate);
      if (!entry || entry === currentFile) {
        return candidate;
      }
      counter += 1;
    }
  }

  private validateImportRoot(): string {
    const configuredRoot = this.getImportRoot().trim();
    if (!configuredRoot) {
      throw new Error("Das Ablageverzeichnis darf nicht leer sein.");
    }
    const root = normalizePath(configuredRoot);
    if (!root || root === "/" || root.split("/").includes("..")) {
      throw new Error("Das Ablageverzeichnis ist ungültig.");
    }
    return root.replace(/^\/+|\/+$/g, "");
  }

  private async ensureFolder(path: string): Promise<void> {
    const segments = normalizePath(path).split("/").filter(Boolean);
    let currentPath = "";
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const entry = this.app.vault.getAbstractFileByPath(currentPath);
      if (entry instanceof TFile) {
        throw new Error(`„${currentPath}“ ist eine Datei und kann nicht als Ordner verwendet werden.`);
      }
      if (!(entry instanceof TFolder)) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }
}
