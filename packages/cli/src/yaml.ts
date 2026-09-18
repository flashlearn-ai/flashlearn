/** Serialize the JSON-compatible values returned by CLI query commands. */
export function toYaml(value: unknown, indent = 0): string {
  const space = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${space}[]`;
    return value.map((item) => {
      if (isScalar(item)) return `${space}- ${yamlScalar(item)}`;
      const nested = toYaml(item, indent + 2).split("\n");
      return `${space}-${nested.map((line, index) => index === 0 ? ` ${line.trimStart()}` : `\n${line}`).join("")}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return `${space}{}`;
    return entries.map(([key, item]) => isScalar(item)
      ? `${space}${key}: ${yamlScalar(item)}`
      : `${space}${key}:\n${toYaml(item, indent + 2)}`).join("\n");
  }
  return `${space}${yamlScalar(value)}`;
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

function yamlScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "null";
  return String(value);
}
