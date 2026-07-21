# AGENTS.md

## Project purpose

This repository contains the desktop-only Obsidian plugin **Microsoft To Do Importer**. It reads open Microsoft To Do tasks through Microsoft Graph and imports each task as a Markdown note.

## Architecture

- `src/auth.ts`: delegated Microsoft authentication and secure MSAL cache persistence.
- `src/graph-client.ts`: typed Microsoft Graph REST access and response validation.
- `src/importer.ts`: Vault indexing, folder/file decisions, create/update behavior.
- `src/markdown.ts`: deterministic Markdown and YAML generation.
- `src/import-modal.ts` and `src/settings.ts`: German user interface.
- `src/main.ts`: plugin lifecycle and dependency wiring only.

Keep business logic out of UI classes. Prefer small pure functions where possible.

## Development commands

On Windows use `npm.cmd` if the PowerShell execution policy blocks `npm.ps1`.

- `npm.cmd install`
- `npm.cmd run dev`
- `npm.cmd run build`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test`

## Coding rules

- TypeScript must remain in strict mode.
- Never introduce explicit `any`, `as any`, unchecked JSON casts, or implicit global state.
- Treat network JSON as `unknown` and validate it with type guards.
- Use the Obsidian Vault and FileManager APIs instead of direct filesystem access.
- Use `requestUrl` for Graph HTTP requests.
- Keep all plugin CSS under the `ms-todo-importer` class namespace.
- UI and user-facing documentation are German; identifiers and source comments are English.

## Security and data handling

- Never add a client secret. This is a public-client OAuth application.
- Request read-only `Tasks.Read` access only.
- Store the MSAL token cache in Obsidian SecretStorage, never in plugin `data.json`.
- Do not add telemetry or send task data anywhere except Microsoft Graph.

## Testing expectations

Every change must keep typecheck, lint, tests, and the production build green. Add tests for changes to Graph parsing, filtering, paths, collision behavior, YAML, Markdown, and create/update decisions.
