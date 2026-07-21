export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  context: string
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${context}: Feld „${key}“ ist keine Zeichenkette.`);
  }
  return value;
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  context: string
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${context}: Feld „${key}“ ist keine Zeichenkette.`);
  }
  return value;
}

export function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  context: string
): boolean | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${context}: Feld „${key}“ ist kein boolescher Wert.`);
  }
  return value;
}
