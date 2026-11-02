/**
 * Fills {name} placeholders in a URL template. Keys may hold path separators,
 * as in "0/760", so each path segment is encoded on its own. Keys are checked
 * against the source's keyPattern before they reach this point.
 */
export function fillKeys(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    (values[name] ?? "").split("/").map(encodeURIComponent).join("/"),
  );
}
