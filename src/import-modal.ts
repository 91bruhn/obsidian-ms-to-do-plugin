import { Modal, Notice, Setting, type App } from "obsidian";
import type { MicrosoftGraphClient } from "./graph-client";
import type { TaskImporter } from "./importer";
import type { ImportSelection, ImportSummary, TodoTask, TodoTaskList } from "./types";

interface ListState {
  list: TodoTaskList;
  tasks: TodoTask[];
  loading: boolean;
  error?: string;
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        await worker(value);
      }
    }
  });
  await Promise.all(runners);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler";
}

export class ImportModal extends Modal {
  private listStates: ListState[] = [];
  private selectedTaskIds = new Set<string>();
  private importedTaskIds = new Map<string, number>();
  private loading = true;
  private importing = false;
  private error = "";
  private progress = "";
  private summary: ImportSummary | null = null;

  public constructor(
    app: App,
    private readonly graph: MicrosoftGraphClient,
    private readonly importer: TaskImporter
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.modalEl.addClass("ms-todo-importer-modal");
    this.render();
    void this.loadListsAndTasks();
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private async loadListsAndTasks(): Promise<void> {
    this.loading = true;
    this.error = "";
    this.summary = null;
    this.render();
    try {
      this.importedTaskIds = this.importer.getImportedTaskIdCounts();
      const lists = await this.graph.listTaskLists();
      this.listStates = lists.map((list) => ({ list, tasks: [], loading: true }));
      this.loading = false;
      this.render();

      await mapWithConcurrency(this.listStates, 4, async (state) => {
        try {
          state.tasks = await this.graph.listOpenTasks(state.list.id);
        } catch (error: unknown) {
          state.error = errorMessage(error);
        } finally {
          state.loading = false;
          this.render();
        }
      });
    } catch (error: unknown) {
      this.loading = false;
      this.error = errorMessage(error);
      this.render();
    }
  }

  private render(): void {
    this.setTitle("Microsoft To Do importieren");
    this.contentEl.empty();
    this.contentEl.addClass("ms-todo-importer");

    if (this.error) {
      this.contentEl.createDiv({ cls: "ms-todo-importer__error", text: this.error });
    }
    if (this.loading) {
      this.contentEl.createEl("p", { text: "Microsoft-To-Do-Listen werden geladen …" });
    }

    const toolbar = new Setting(this.contentEl);
    toolbar.addButton((button) =>
      button.setButtonText("Aktualisieren").setDisabled(this.loading || this.importing).onClick(() => {
        void this.loadListsAndTasks();
      })
    );
    toolbar.addButton((button) =>
      button
        .setButtonText(this.importing ? "Import läuft …" : "Auswahl importieren")
        .setCta()
        .setDisabled(this.importing || this.selectedTaskIds.size === 0)
        .onClick(() => {
          void this.importSelectedTasks();
        })
    );

    if (this.progress) {
      this.contentEl.createEl("p", { cls: "ms-todo-importer__progress", text: this.progress });
    }

    const listContainer = this.contentEl.createDiv({ cls: "ms-todo-importer__lists" });
    for (const state of this.listStates) {
      this.renderList(listContainer, state);
    }
    if (!this.loading && this.listStates.length === 0 && !this.error) {
      listContainer.createEl("p", { text: "Keine Microsoft-To-Do-Listen gefunden." });
    }

    if (this.summary) {
      this.renderSummary(this.summary);
    }
  }

  private renderList(container: HTMLElement, state: ListState): void {
    const details = container.createEl("details", { cls: "ms-todo-importer__list" });
    details.open = true;
    const summary = details.createEl("summary", { cls: "ms-todo-importer__list-header" });
    const listCheckbox = summary.createEl("input", { type: "checkbox" });
    const selectableTasks = state.tasks;
    const selectedCount = selectableTasks.filter((task) => this.selectedTaskIds.has(task.id)).length;
    listCheckbox.checked = selectableTasks.length > 0 && selectedCount === selectableTasks.length;
    listCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectableTasks.length;
    listCheckbox.disabled = state.loading || selectableTasks.length === 0 || this.importing;
    listCheckbox.addEventListener("click", (event) => event.stopPropagation());
    listCheckbox.addEventListener("change", () => {
      for (const task of selectableTasks) {
        if (listCheckbox.checked) this.selectedTaskIds.add(task.id);
        else this.selectedTaskIds.delete(task.id);
      }
      this.render();
    });
    summary.createSpan({ cls: "ms-todo-importer__list-title", text: state.list.displayName });
    summary.createSpan({
      cls: "ms-todo-importer__count",
      text: state.loading ? "…" : String(state.tasks.length)
    });

    const taskContainer = details.createDiv({ cls: "ms-todo-importer__tasks" });
    if (state.loading) {
      taskContainer.createEl("p", { text: "Aufgaben werden geladen …" });
    } else if (state.error) {
      taskContainer.createDiv({ cls: "ms-todo-importer__error", text: state.error });
    } else if (state.tasks.length === 0) {
      taskContainer.createEl("p", { cls: "ms-todo-importer__empty", text: "Keine offenen Aufgaben." });
    } else {
      for (const task of state.tasks) {
        this.renderTask(taskContainer, task);
      }
    }
  }

  private renderTask(container: HTMLElement, task: TodoTask): void {
    const label = container.createEl("label", { cls: "ms-todo-importer__task" });
    const checkbox = label.createEl("input", { type: "checkbox" });
    checkbox.checked = this.selectedTaskIds.has(task.id);
    checkbox.disabled = this.importing;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) this.selectedTaskIds.add(task.id);
      else this.selectedTaskIds.delete(task.id);
      this.render();
    });
    label.createSpan({ text: task.title || "Unbenannter Task" });
    const duplicateCount = this.importedTaskIds.get(task.id) ?? 0;
    if (duplicateCount > 0) {
      label.createSpan({
        cls: duplicateCount > 1 ? "ms-todo-importer__badge is-conflict" : "ms-todo-importer__badge",
        text: duplicateCount > 1 ? `${duplicateCount} ID-Konflikte` : "bereits importiert"
      });
    }
  }

  private async importSelectedTasks(): Promise<void> {
    const selections: ImportSelection[] = this.listStates
      .map((state) => ({
        list: state.list,
        tasks: state.tasks.filter((task) => this.selectedTaskIds.has(task.id))
      }))
      .filter((selection) => selection.tasks.length > 0);
    if (selections.length === 0) return;

    this.importing = true;
    this.progress = "Import wird vorbereitet …";
    this.summary = null;
    this.render();
    try {
      this.summary = await this.importer.importTasks(
        selections,
        this.listStates.map((state) => state.list),
        (completed, total, title) => {
          this.progress = `${completed}/${total}: ${title}`;
          this.render();
        }
      );
      this.selectedTaskIds.clear();
      this.importedTaskIds = this.importer.getImportedTaskIdCounts();
      new Notice(
        `Import abgeschlossen: ${this.summary.created} neu, ${this.summary.updated} aktualisiert, ${this.summary.conflicts} Konflikte, ${this.summary.errors} Fehler.`
      );
    } catch (error: unknown) {
      this.error = errorMessage(error);
    } finally {
      this.importing = false;
      this.progress = "";
      this.render();
    }
  }

  private renderSummary(summary: ImportSummary): void {
    const container = this.contentEl.createDiv({ cls: "ms-todo-importer__result" });
    container.createEl("h3", { text: "Import-Ergebnis" });
    container.createEl("p", {
      text: `${summary.created} neu · ${summary.updated} aktualisiert · ${summary.conflicts} Konflikte · ${summary.errors} Fehler`
    });
    const notableItems = summary.items.filter((item) => item.status === "conflict" || item.status === "error");
    if (notableItems.length > 0) {
      const list = container.createEl("ul");
      for (const item of notableItems) {
        list.createEl("li", { text: `${item.taskTitle}: ${item.message ?? item.status}` });
      }
    }
  }
}
