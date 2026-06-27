/**
 * Escape a string for use in a Google Drive API query.
 * Escapes backslashes and single quotes.
 */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
