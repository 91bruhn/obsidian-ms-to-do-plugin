import { requestUrl } from "obsidian";
import type { MicrosoftAuthService } from "./auth";
import {
  isRecord,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString
} from "./type-guards";
import type { ChecklistItem, GraphPage, TodoTask, TodoTaskBody, TodoTaskList } from "./types";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

type ItemParser<T> = (value: unknown) => T;

export class GraphApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

function parseJson(text: string, context: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context}: Microsoft Graph lieferte kein gültiges JSON.`);
  }
}

export function parseGraphPage<T>(text: string, itemParser: ItemParser<T>): GraphPage<T> {
  const raw = parseJson(text, "Graph-Antwort");
  if (!isRecord(raw) || !Array.isArray(raw.value)) {
    throw new Error("Graph-Antwort: Feld „value“ fehlt oder ist keine Liste.");
  }

  const nextLinkValue = raw["@odata.nextLink"];
  if (nextLinkValue !== undefined && typeof nextLinkValue !== "string") {
    throw new Error("Graph-Antwort: @odata.nextLink ist ungültig.");
  }

  const page: GraphPage<T> = { value: raw.value.map(itemParser) };
  if (typeof nextLinkValue === "string") {
    page.nextLink = nextLinkValue;
  }
  return page;
}

export function parseTodoTaskList(value: unknown): TodoTaskList {
  if (!isRecord(value)) {
    throw new Error("To-Do-Liste ist kein Objekt.");
  }
  const context = "To-Do-Liste";
  const result: TodoTaskList = {
    id: readRequiredString(value, "id", context),
    displayName: readRequiredString(value, "displayName", context)
  };
  const isOwner = readOptionalBoolean(value, "isOwner", context);
  const isShared = readOptionalBoolean(value, "isShared", context);
  const wellknownListName = readOptionalString(value, "wellknownListName", context);
  if (isOwner !== undefined) result.isOwner = isOwner;
  if (isShared !== undefined) result.isShared = isShared;
  if (wellknownListName !== undefined) result.wellknownListName = wellknownListName;
  return result;
}

function parseTaskBody(value: unknown): TodoTaskBody | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("To-Do-Task: body ist kein Objekt.");
  }
  return {
    content: readRequiredString(value, "content", "To-Do-Task body"),
    contentType: readRequiredString(value, "contentType", "To-Do-Task body")
  };
}

export function parseTodoTask(value: unknown): TodoTask {
  if (!isRecord(value)) {
    throw new Error("To-Do-Task ist kein Objekt.");
  }
  const result: TodoTask = {
    id: readRequiredString(value, "id", "To-Do-Task"),
    title: readRequiredString(value, "title", "To-Do-Task"),
    status: readRequiredString(value, "status", "To-Do-Task"),
    importance: readRequiredString(value, "importance", "To-Do-Task"),
    createdDateTime: readRequiredString(value, "createdDateTime", "To-Do-Task")
  };
  const body = parseTaskBody(value.body);
  if (body !== undefined) result.body = body;
  return result;
}

export function parseChecklistItem(value: unknown): ChecklistItem {
  if (!isRecord(value)) {
    throw new Error("Checklistenpunkt ist kein Objekt.");
  }
  const isChecked = value.isChecked;
  if (typeof isChecked !== "boolean") {
    throw new Error("Checklistenpunkt: Feld „isChecked“ ist kein boolescher Wert.");
  }
  const result: ChecklistItem = {
    id: readRequiredString(value, "id", "Checklistenpunkt"),
    displayName: readRequiredString(value, "displayName", "Checklistenpunkt"),
    isChecked
  };
  const createdDateTime = readOptionalString(value, "createdDateTime", "Checklistenpunkt");
  if (createdDateTime !== undefined) result.createdDateTime = createdDateTime;
  return result;
}

export interface ChecklistProvider {
  listOpenChecklistItems(listId: string, taskId: string): Promise<ChecklistItem[]>;
}

export class MicrosoftGraphClient implements ChecklistProvider {
  public constructor(private readonly auth: MicrosoftAuthService) {}

  public async listTaskLists(): Promise<TodoTaskList[]> {
    return this.getAll(`${GRAPH_ROOT}/me/todo/lists`, parseTodoTaskList);
  }

  public async listOpenTasks(listId: string): Promise<TodoTask[]> {
    const encodedListId = encodeURIComponent(listId);
    const tasksUrl = `${GRAPH_ROOT}/me/todo/lists/${encodedListId}/tasks`;
    const filteredUrl = `${tasksUrl}?$filter=status%20ne%20'completed'`;

    let tasks: TodoTask[];
    try {
      tasks = await this.getAll(filteredUrl, parseTodoTask);
    } catch (error: unknown) {
      if (!(error instanceof GraphApiError) || error.status !== 400) {
        throw error;
      }
      tasks = await this.getAll(tasksUrl, parseTodoTask);
    }
    return tasks.filter((task) => task.status !== "completed");
  }

  public async listOpenChecklistItems(listId: string, taskId: string): Promise<ChecklistItem[]> {
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const items = await this.getAll(
      `${GRAPH_ROOT}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems`,
      parseChecklistItem
    );
    return items.filter((item) => !item.isChecked);
  }

  private async getAll<T>(initialUrl: string, parser: ItemParser<T>): Promise<T[]> {
    const accessToken = await this.auth.getAccessToken();
    const result: T[] = [];
    let nextUrl: string | undefined = initialUrl;

    while (nextUrl) {
      const response = await requestUrl({
        url: nextUrl,
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        throw: false
      });

      if (response.status < 200 || response.status >= 300) {
        throw new GraphApiError(
          `Microsoft Graph antwortete mit HTTP ${response.status}: ${response.text.slice(0, 500)}`,
          response.status
        );
      }
      const page = parseGraphPage(response.text, parser);
      result.push(...page.value);
      nextUrl = page.nextLink;
    }
    return result;
  }
}
