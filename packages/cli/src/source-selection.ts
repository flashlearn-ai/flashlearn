import type { SourceDocument } from "@flashlearn/extraction";

const EXCLUDED = /(^|\/)(?:_[^/]*licenses?|licenses?|vendor|third[_-]party|node_modules|\.[^/]+|testdata|fixtures?|testfixtures?|e2e|tests?|[^/]*test|benchmarking|benchmarks?|generated)(\/|$)/i;
const META = /(^|\/)(?:agents|claude|skill|contributing|collaborating|code_of_conduct|governance|maintainers|changelog|license|security)\b[^/]*\.md$/i;
export const isDocumentation = (document: SourceDocument) => /\.md$/i.test(document.path);
export const isReadme = (document: SourceDocument) => /(^|\/)readme\.md$/i.test(document.path);

export function relevantSource(document: SourceDocument): boolean {
  return Boolean(document.content.trim()) && !EXCLUDED.test(document.path) && !META.test(document.path)
    && !/(?:_test|\.test|\.spec|\.pb|_generated)\.(go|tsx?|jsx?)$/i.test(document.path);
}

/** Stable, cheap importance classification. No source or paths leave the machine here. */
export function classifySources(documents: SourceDocument[]) {
  const eligible = documents.filter(relevantSource);
  const readme = eligible.filter(isReadme).sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))[0];
  const linked = new Set<string>();
  for (const match of readme?.content.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g) ?? []) {
    const path = match[1]!.replace(/^\.\//, "");
    const parent = readme!.path.includes("/") ? readme!.path.slice(0, readme!.path.lastIndexOf("/") + 1) : "";
    linked.add(parent + path);
  }
  const score = (document: SourceDocument) => {
    if (document === readme) return 1000;
    const path = document.path.toLowerCase();
    let value = linked.has(document.path) ? 100 : 0;
    if (isDocumentation(document)) {
      value += /architecture|glossary|concept|overview|design|lifecycle/.test(path) ? 180 : 20;
      value += /api.guide|request|routing|authentication|storage|security|snapshot/.test(path) ? 80 : 0;
      value -= /roadmap|proposal|benchmark|demo|install|quickstart|dev\//.test(path) ? 80 : 0;
    } else {
      value += /(?:^|\/)(doc|main|index|app|server|service|router|store|scheduling)\.(go|tsx?|jsx?)$/.test(path) ? 100 : 0;
      value += /workflow|lifecycle|reconcil|schedul|routing|resume|suspend|checkpoint|auth|policy/.test(path) ? 65 : 0;
      value += /invariant|crash|transaction|state machine|control plane|orchestrat/i.test(document.content) ? 30 : 0;
      value -= /metrics|logging|config|defaults|conversion|util|\/tools\/|^tools\/|setup/.test(path) ? 60 : 0;
      if (document.content.length < 900) value -= 80; // Empty package markers rarely teach a mechanism.
    }
    return value;
  };
  return { readme, excluded: documents.length - eligible.length,
    ranked: eligible.sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path)) };
}

export function subsystem(path: string): string {
  const parts = path.split("/");
  return parts.length < 2 ? "root" : parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

/** Reserve two foundation batches, then group code by subsystem for coherent flows. */
export function selectBatches(ranked: SourceDocument[]): SourceDocument[][] {
  const docs = ranked.filter(isDocumentation).slice(0, 5);
  const batches: SourceDocument[][] = [];
  // Keep the README and vocabulary from being crowded out by long design docs.
  if (docs.length) batches.push(docs.slice(0, 1));
  if (docs.length > 1) batches.push(docs.slice(1));
  let groups = new Map<string, SourceDocument[]>();
  for (const document of ranked.filter((doc) => !isDocumentation(doc))) {
    const group = subsystem(document.path);
    groups.set(group, [...(groups.get(group) ?? []), document]);
  }
  // Prefer runnable components to generic shared helpers when the batch budget is small.
  groups = new Map([...groups].sort(([a], [b]) => Number(/^(cmd|src|app)\//.test(b)) - Number(/^(cmd|src|app)\//.test(a))));
  // One batch per subsystem first, then deeper coverage if slots remain.
  while (batches.length < 8 && groups.size) {
    for (const [name, group] of groups) {
      if (batches.length === 8) break;
      batches.push(group.splice(0, 4));
      if (!group.length) groups.delete(name);
    }
  }
  return batches;
}

/** Complete paragraphs/functions where possible, instead of chopping at a character offset. */
export function sourceExcerpt(document: SourceDocument, limit = 7_000): string {
  const content = document.content;
  if (content.length <= limit) return content;
  if (isDocumentation(document)) {
    const sections = content.split(/(?=^#{1,3} )/m);
    const header = sections.shift() ?? ""; // Retain warnings, including aspirational status.
    const ranked = sections.map((text, i) => ({ text, i,
      score: /what is|purpose|overview|concept|component|lifecycle|high.level|resource|snapshot|routing|request|security|relationship/i.test(text.split("\n")[0]!) ? 1 : 0,
    })).sort((a, b) => b.score - a.score || a.i - b.i);
    let used = Math.min(header.length, 1500, limit);
    const chosen = [];
    for (const section of ranked) {
      if (used + section.text.length + 28 <= limit) { chosen.push(section); used += section.text.length + 28; }
    }
    return header.slice(0, Math.min(1500, limit)) + chosen.sort((a, b) => a.i - b.i).map(({ text }) => text).join("\n[other sections omitted]\n");
  }
  // Go and JS/TS top-level declarations provide useful boundaries; retain file
  // context, then sample whole declarations with lifecycle/behavior signals.
  const blocks = content.split(/(?=^(?:func |(?:export )?(?:async )?function |(?:export )?class ))/m);
  const header = blocks.shift() ?? "";
  const boundary = (text: string, size: number) => {
    const newline = text.lastIndexOf("\n", size);
    return text.slice(0, newline < 0 ? size : newline);
  };
  let result = header.length < limit / 2 ? header : boundary(header, Math.min(1800, limit));
  const sorted = blocks.map((text, i) => ({ text, i, score: /resume|suspend|reconcil|request|handle|restore|checkpoint|assign|transaction/i.test(text.split("\n")[0]!) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  for (const { text } of sorted) if (result.length + text.length + 30 <= limit) result += `\n// [separate source excerpt]\n${text}`;
  if (!result.trim()) result = boundary(content, limit);
  return result;
}
