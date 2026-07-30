import { Modal, Notice, Setting, type App } from "obsidian";
import type { DeviceCodePrompt, MicrosoftAuthService } from "./auth";

export class DeviceCodeModal extends Modal {
  private prompt: DeviceCodePrompt | null = null;
  private status = "Microsoft-Anmeldung wird vorbereitet …";

  public constructor(
    app: App,
    private readonly auth: MicrosoftAuthService,
    private readonly onConnected: () => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.authenticate().then(() => {
      this.render()
    });
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  private async authenticate(): Promise<void> {
    try {
      const account = await this.auth.connect((prompt) => {
        this.prompt = prompt;
        this.status = "Warte auf die Anmeldung im Browser …";
        this.render();
      });
      this.status = `Verbunden als ${account.username || account.name || "Microsoft-Konto"}.`;
      this.render();
      this.onConnected();
      new Notice("Microsoft-Konto wurde verbunden.");
    } catch (error: unknown) {
      this.status = error instanceof Error ? error.message : "Die Anmeldung ist fehlgeschlagen.";
      this.render();
    }
  }

  private render(): void {
    this.setTitle("Mit Microsoft verbinden");
    this.contentEl.empty();
    this.contentEl.addClass("ms-todo-importer-auth");
    this.contentEl.createEl("p", { text: this.status });

    if (this.prompt) {
      const code = this.contentEl.createEl("div", {
        cls: "ms-todo-importer-auth__code",
        text: this.prompt.userCode
      });
      code.setAttr("aria-label", "Microsoft-Gerätecode");
      this.contentEl.createEl("p", {
        cls: "ms-todo-importer-auth__message",
        text: this.prompt.message
      });

      new Setting(this.contentEl)
        .addButton((button) =>
          button.setButtonText("Microsoft-Seite öffnen").setCta().onClick(() => {
            window.open(this.prompt?.verificationUri, "_blank", "noopener,noreferrer");
          })
        )
        .addButton((button) =>
          button.setButtonText("Code kopieren").onClick(async () => {
            const userCode = this.prompt?.userCode;
            if (!userCode) return;
            await navigator.clipboard.writeText(userCode);
            new Notice("Gerätecode wurde kopiert.");
          })
        );
    }
  }
}
