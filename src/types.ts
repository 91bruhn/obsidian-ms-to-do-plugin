export interface GraphPage<T> {
  value: T[];
  nextLink?: string;
}

export interface TodoTaskList {
  id: string;
  displayName: string;
  isOwner?: boolean;
  isShared?: boolean;
  wellknownListName?: string;
}

export interface TodoTaskBody {
  content: string;
  contentType: string;
}

export interface TodoTask {
  id: string;
  title: string;
  status: string;
  importance: string;
  createdDateTime: string;
  body?: TodoTaskBody;
}

export interface ChecklistItem {
  id: string;
  displayName: string;
  isChecked: boolean;
  createdDateTime?: string;
}

export interface ImportSelection {
  list: TodoTaskList;
  tasks: TodoTask[];
}

export type ImportResultStatus = "created" | "updated" | "conflict" | "error";

export interface ImportResultItem {
  taskId: string;
  taskTitle: string;
  status: ImportResultStatus;
  path?: string;
  message?: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  conflicts: number;
  errors: number;
  items: ImportResultItem[];
}
