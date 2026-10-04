const RESERVED_FIELD_NAMES = new Set([
  "medio",
  "hora",
  "resultado",
  "dominio",
  "planner",
  "owner",
  "fecha",
]);

function normalizeFieldName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesOpportunityContactEvent(
  eventType: string | null | undefined,
  memo: string | null | undefined,
  expectedType: string,
  legacyPrefix: string
) {
  if (eventType === expectedType) return true;
  if (eventType && eventType !== "legacy") return false;
  return (memo || "").trim().startsWith(legacyPrefix);
}

export function legacyActivityText(value: unknown, key: string) {
  const archive = Array.isArray(value) ? value[0] : value;
  if (!archive || typeof archive !== "object") return "";

  const payload = (archive as { legacy_payload?: unknown }).legacy_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";

  const field = (payload as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

export function parseOpportunityContactMemo(
  memo: string | null | undefined,
  prefix: "[VALORACION]" | "[R.G.]"
) {
  const text = (memo || "").trim();
  let body = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
  let author = "";

  const authorMatch = body.match(/^([^:]+):\s*([\s\S]*)$/);
  if (authorMatch) {
    const possibleAuthor = authorMatch[1].trim();
    if (!RESERVED_FIELD_NAMES.has(normalizeFieldName(possibleAuthor))) {
      author = possibleAuthor;
      body = authorMatch[2].trim();
    }
  }

  const [summaryLine, ...memoLines] = body.split("\n");
  const fields = summaryLine.split("|").reduce<Record<string, string>>((acc, part) => {
    const separatorIndex = part.indexOf(":");
    if (separatorIndex === -1) return acc;

    const key = normalizeFieldName(part.slice(0, separatorIndex));
    const value = part.slice(separatorIndex + 1).trim();
    if (key) acc[key] = value;
    return acc;
  }, {});

  return {
    author,
    fields,
    memo: memoLines.join("\n").trim(),
  };
}
