# Microsoft To Do Importer

Dieses Desktop-Plugin importiert offene Aufgaben aus Microsoft To Do als eigenständige Markdown-Notes in einen Obsidian-Vault. Jede To-Do-Liste erhält einen eigenen Ordner. Bereits importierte Aufgaben werden über ihre Microsoft-Graph-ID erkannt und beim erneuten Import vollständig aktualisiert.

> Microsoft To Do wird über die REST-API von Microsoft Graph angebunden. Microsoft Graph ist keine GraphQL-API. Für die Anmeldung wird kein API-Key und kein Client Secret benötigt, sondern die öffentliche Client-ID einer Microsoft-Entra-App-Registrierung.

## Voraussetzungen

- Obsidian Desktop 1.11.4 oder neuer
- Node.js für die Entwicklung
- Ein persönliches Microsoft-Konto oder ein Microsoft-Geschäfts-/Schulkonto
- Eine eigene App-Registrierung in Microsoft Entra

## Entra-App registrieren

1. Öffne das [Microsoft Entra Admin Center](https://entra.microsoft.com/) und erstelle unter **App registrations** eine neue Registrierung.
2. Wähle als unterstützte Kontotypen **Accounts in any organizational directory and personal Microsoft accounts**.
3. Notiere die **Application (client) ID**. Die Directory-/Tenant-ID wird nicht benötigt.
4. Füge unter **API permissions → Microsoft Graph → Delegated permissions** ausschließlich `Tasks.Read` hinzu. `User.Read` kann entfernt werden, sofern Entra dies für deine Registrierung erlaubt.
5. Aktiviere unter **Authentication → Advanced settings** die Option **Allow public client flows**.
6. Es wird kein Redirect-URI und insbesondere kein Client Secret angelegt.

Das Plugin verwendet den Device-Code-Flow gegen den Microsoft-Tenant `common`. Beim Verbinden zeigt es einen Code und die Microsoft-Anmeldeseite an. Der MSAL-Token-Cache wird im SecretStorage des jeweiligen Obsidian-Vaults abgelegt.

## Installation für die Entwicklung

```powershell
npm.cmd install
npm.cmd run build
```

Kopiere oder verlinke anschließend diesen Ordner nach:

```text
<Vault>/.obsidian/plugins/microsoft-todo-importer
```

Für eine manuelle Installation werden `manifest.json`, `main.js` und `styles.css` benötigt. Aktiviere danach das Plugin in Obsidian unter **Community plugins**.

## Einrichtung und Verwendung

1. Öffne die Plugin-Einstellungen.
2. Trage die Application-/Client-ID ein.
3. Lege das Ablageverzeichnis fest; Standard ist `Microsoft To Do`.
4. Klicke auf **Verbinden**, öffne die angezeigte Microsoft-Seite und gib den Code ein.
5. Öffne den Import über das Listen-Symbol im Ribbon oder den Command **Microsoft To Do importieren**.
6. Wähle ganze Listen oder einzelne offene Aufgaben und starte den Import.

Die Ordnerstruktur sieht beispielsweise so aus:

```text
Microsoft To Do/
  Arbeit/
    Angebot vorbereiten.md
  Privat/
    Fahrrad reparieren.md
```

## Erzeugtes Markdown

```markdown
---
ms-todo-task-id: "<Graph-Task-ID>"
ms-todo-list-id: "<Graph-Listen-ID>"
dateCreated: 2026-07-09T04:07:52.536+02:00
priority: high
status: none
tags:
  - ms-todo
  - task
---

# Teilaufgaben

- Offener Checklistenpunkt

# Notizen

Inhalt der Microsoft-To-Do-Notiz
```

- Erledigte Aufgaben und erledigte Checklistenpunkte werden nicht angezeigt oder importiert.
- `priority` ist nur für als wichtig markierte Aufgaben `high`, ansonsten `low`.
- `dateCreated` wird in die lokale Zeitzone des Rechners konvertiert.
- Beim erneuten Import ersetzt das Plugin die gesamte bestehende Note, einschließlich manueller Änderungen, und verschiebt bzw. benennt sie bei Bedarf um.

## Einschränkungen

- Die in der Microsoft-To-Do-Oberfläche sichtbaren Listengruppen sind im dokumentierten Microsoft-Graph-v1.0-Modell nicht verfügbar. Listen werden deshalb direkt unter dem Ablageverzeichnis gespeichert; ein `ms-todo-group-id`-Property wird nicht erzeugt.
- Die ID einer Aufgabe kann sich ändern, wenn Microsoft To Do sie in eine andere Liste verschiebt. In diesem Fall kann Graph die neue Aufgabe nicht zuverlässig der bereits importierten Note zuordnen und es kann eine neue Note entstehen.
- Gleichnamige Dateien oder Listen erhalten nur bei einer Kollision einen kurzen, stabilen Hash-Zusatz.
- Version 1 bietet keine automatische Hintergrundsynchronisation und schreibt keine Änderungen zurück zu Microsoft To Do.

## Datenschutz

Das Plugin verbindet sich ausschließlich mit den Microsoft-Anmeldeendpunkten und `graph.microsoft.com`. Es liest mit `Tasks.Read` To-Do-Listen, Aufgaben und Checklistenpunkte. Es enthält keine Telemetrie, Werbung oder sonstige Datenübertragung.

## Entwicklung

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Der produktive Build erzeugt `main.js`. Diese Datei wird nicht im Repository versioniert.
