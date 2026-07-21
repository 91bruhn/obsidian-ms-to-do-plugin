import { Notice, Plugin } from "obsidian";
import { MicrosoftAuthService } from "./auth";
import { MicrosoftGraphClient } from "./graph-client";
import { ImportModal } from "./import-modal";
import { TaskImporter } from "./importer";
import {
  DEFAULT_SETTINGS,
  MicrosoftTodoImporterSettingTab,
  type MicrosoftTodoImporterSettings,
  type SettingsPluginHost
} from "./settings";
import { isRecord } from "./type-guards";

function parseSettings(value: unknown): MicrosoftTodoImporterSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    clientId: typeof value.clientId === "string" ? value.clientId : DEFAULT_SETTINGS.clientId,
    importRoot: typeof value.importRoot === "string" ? value.importRoot : DEFAULT_SETTINGS.importRoot
  };
}

export default class MicrosoftTodoImporterPlugin extends Plugin implements SettingsPluginHost {
  public override settings: MicrosoftTodoImporterSettings = { ...DEFAULT_SETTINGS };
  public auth!: MicrosoftAuthService;
  private graph!: MicrosoftGraphClient;
  private importer!: TaskImporter;

  public override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.auth = new MicrosoftAuthService(this.app, () => this.settings.clientId);
    this.graph = new MicrosoftGraphClient(this.auth);
    this.importer = new TaskImporter(this.app, this.graph, () => this.settings.importRoot);

    this.addRibbonIcon("list-checks", "Microsoft To Do importieren", () => this.openImporter());
    this.addCommand({
      id: "open-microsoft-todo-importer",
      name: "Microsoft To Do importieren",
      callback: () => this.openImporter()
    });
    this.addSettingTab(new MicrosoftTodoImporterSettingTab(this.app, this));
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  public async onClientIdChanged(): Promise<void> {
    await this.auth.disconnect();
  }

  private openImporter(): void {
    if (!this.settings.clientId.trim()) {
      new Notice("Bitte zuerst in den Plugin-Einstellungen eine Microsoft Client-ID eintragen.");
      return;
    }
    new ImportModal(this.app, this.graph, this.importer).open();
  }
}
