import { PluginSettingTab, Setting, normalizePath, type App, type Plugin } from "obsidian";
import { DeviceCodeModal } from "./auth-modal";
import type { MicrosoftAuthService } from "./auth";

export interface MicrosoftTodoImporterSettings {
  clientId: string;
  importRoot: string;
}

export const DEFAULT_SETTINGS: MicrosoftTodoImporterSettings = {
  clientId: "",
  importRoot: "Microsoft To Do"
};

export interface SettingsPluginHost extends Plugin {
  settings: MicrosoftTodoImporterSettings;
  auth: MicrosoftAuthService;
  saveSettings(): Promise<void>;
  onClientIdChanged(): Promise<void>;
}

export class MicrosoftTodoImporterSettingTab extends PluginSettingTab {
  public constructor(
    app: App,
    private readonly host: SettingsPluginHost
  ) {
    super(app, host);
  }

  public override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ms-todo-importer-settings");

    new Setting(containerEl)
      .setName("Microsoft Application-/Client-ID")
      .setDesc("Öffentliche Client-ID der Entra-App-Registrierung. Kein API-Key und kein Client Secret.")
      .addText((text) =>
        text
          .setPlaceholder("00000000-0000-0000-0000-000000000000")
          .setValue(this.host.settings.clientId)
          .onChange(async (value) => {
            const previousValue = this.host.settings.clientId;
            this.host.settings.clientId = value.trim();
            await this.host.saveSettings();
            if (previousValue !== this.host.settings.clientId) {
              await this.host.onClientIdChanged();
            }
          })
      );

    new Setting(containerEl)
      .setName("Ablageverzeichnis")
      .setDesc("Vault-relativer Ordner, unter dem pro Microsoft-To-Do-Liste ein Unterordner entsteht.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.importRoot)
          .setValue(this.host.settings.importRoot)
          .onChange(async (value) => {
            const normalized = value.trim() ? normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") : "";
            this.host.settings.importRoot = normalized;
            await this.host.saveSettings();
          })
      );

    const connectionSetting = new Setting(containerEl)
      .setName("Microsoft-Konto")
      .setDesc("Verbindungsstatus wird geprüft …");

    void this.renderConnectionActions(connectionSetting);
  }

  private async renderConnectionActions(setting: Setting): Promise<void> {
    let accountName = "Nicht verbunden";
    try {
      const account = this.host.settings.clientId ? await this.host.auth.getAccount() : null;
      if (account) {
        accountName = account.username || account.name || "Microsoft-Konto";
      }
    } catch {
      accountName = "Nicht verbunden";
    }
    setting.setDesc(accountName);
    setting.controlEl.empty();
    setting.addButton((button) =>
      button
        .setButtonText(accountName === "Nicht verbunden" ? "Verbinden" : "Neu verbinden")
        .setCta()
        .setDisabled(!this.host.settings.clientId)
        .onClick(() => {
          new DeviceCodeModal(this.app, this.host.auth, () => this.display()).open();
        })
    );

    if (accountName !== "Nicht verbunden") {
      setting.addButton((button) =>
        button.setButtonText("Trennen").setWarning().onClick(async () => {
          await this.host.auth.disconnect();
          this.display();
        })
      );
    }
  }
}
