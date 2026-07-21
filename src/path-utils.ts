const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

export function sanitizePathSegment(value: string, fallback: string): string {
  const withoutControlCharacters = [...value]
    .map((character) => (character.codePointAt(0) ?? 0) < 32 ? "-" : character)
    .join("");
  let result = withoutControlCharacters
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  if (result.length === 0) {
    result = fallback;
  }
  if (WINDOWS_RESERVED_NAMES.has(result.toUpperCase())) {
    result = `_${result}`;
  }
  return result.slice(0, 160).replace(/[. ]+$/g, "") || fallback;
}

export function stableShortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

export function withStableSuffix(name: string, id: string): string {
  return `${name} (${stableShortHash(id)})`;
}
