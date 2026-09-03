export function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safeText = typeof value === "string" && /^[ \t]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
}
