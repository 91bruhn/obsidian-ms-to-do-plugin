import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));

import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { MicrosoftAuthService } from "../src/auth";
import {
  MicrosoftGraphClient,
  parseChecklistItem,
  parseGraphPage,
  parseTodoTask,
  parseTodoTaskList
} from "../src/graph-client";

const requestMock = vi.mocked(requestUrl);
const auth = {
  getAccessToken: () => Promise.resolve("access-token")
} as unknown as MicrosoftAuthService;

function response(status: number, body: unknown): RequestUrlResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    headers: {},
    arrayBuffer: new TextEncoder().encode(text).buffer,
    json: body,
    text
  };
}

beforeEach(() => requestMock.mockReset());

describe("Graph response parsing", () => {
  it("parses a paged task response", () => {
    const page = parseGraphPage(
      JSON.stringify({
        value: [
          {
            id: "task-1",
            title: "Task",
            status: "notStarted",
            importance: "normal",
            createdDateTime: "2026-01-01T00:00:00Z",
            body: { content: "Text", contentType: "text" }
          }
        ],
        "@odata.nextLink": "https://graph.microsoft.com/next"
      }),
      parseTodoTask
    );
    expect(page.value[0]?.id).toBe("task-1");
    expect(page.nextLink).toBe("https://graph.microsoft.com/next");
  });

  it("parses lists and checklist items", () => {
    expect(parseTodoTaskList({ id: "list", displayName: "Arbeit", isOwner: true })).toEqual({
      id: "list",
      displayName: "Arbeit",
      isOwner: true
    });
    expect(parseChecklistItem({ id: "item", displayName: "Schritt", isChecked: false })).toEqual({
      id: "item",
      displayName: "Schritt",
      isChecked: false
    });
  });

  it("rejects malformed Graph data", () => {
    expect(() => parseGraphPage('{"value":{}}', parseTodoTask)).toThrow("value");
    expect(() => parseTodoTask({ id: "missing-fields" })).toThrow("title");
    expect(() => parseChecklistItem({ id: "item", displayName: "x", isChecked: "false" })).toThrow(
      "isChecked"
    );
  });

  it("follows pagination and filters completed tasks defensively", async () => {
    requestMock
      .mockResolvedValueOnce(
        response(200, {
          value: [
            {
              id: "done",
              title: "Erledigt",
              status: "completed",
              importance: "normal",
              createdDateTime: "2026-01-01T00:00:00Z"
            }
          ],
          "@odata.nextLink": "https://graph.microsoft.com/next"
        })
      )
      .mockResolvedValueOnce(
        response(200, {
          value: [
            {
              id: "open",
              title: "Offen",
              status: "notStarted",
              importance: "high",
              createdDateTime: "2026-01-01T00:00:00Z"
            }
          ]
        })
      );

    const tasks = await new MicrosoftGraphClient(auth).listOpenTasks("list/id");
    expect(tasks.map((task) => task.id)).toEqual(["open"]);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls[1]?.[0]).toMatchObject({ url: "https://graph.microsoft.com/next" });
  });

  it("retries without the server filter when Graph rejects it", async () => {
    requestMock
      .mockResolvedValueOnce(response(400, { error: { message: "Unsupported filter" } }))
      .mockResolvedValueOnce(
        response(200, {
          value: [
            {
              id: "open",
              title: "Offen",
              status: "notStarted",
              importance: "normal",
              createdDateTime: "2026-01-01T00:00:00Z"
            }
          ]
        })
      );
    const tasks = await new MicrosoftGraphClient(auth).listOpenTasks("list");
    expect(tasks).toHaveLength(1);
    const secondRequest = requestMock.mock.calls[1]?.[0];
    expect(typeof secondRequest).toBe("object");
    if (typeof secondRequest === "object" && secondRequest !== null) {
      expect(secondRequest.url).not.toContain("$filter");
    }
  });

  it("filters checked checklist items", async () => {
    requestMock.mockResolvedValueOnce(
      response(200, {
        value: [
          { id: "open", displayName: "Offen", isChecked: false },
          { id: "done", displayName: "Erledigt", isChecked: true }
        ]
      })
    );
    const items = await new MicrosoftGraphClient(auth).listOpenChecklistItems("list", "task");
    expect(items.map((item) => item.id)).toEqual(["open"]);
  });
});
