/** Per-topic identity for the chooser: a glyph and an accent. Mastery is not
 *  reported by any endpoint, so no count is claimed here.
 *
 *  Topic identity only: no card content. Sample cards and their excerpts
 *  live in `sample.ts`, which the live build must never import: bundling the
 *  demo deck into the client a project runs would ship content that project
 *  did not generate, even though no code path could display it. */
export type TopicIcon = "terminal" | "database" | "repeat" | "file";

export const TOPIC_META: Record<string, { accent: string; icon: TopicIcon }> = {
  cli: { accent: "#12965a", icon: "terminal" },
  storage: { accent: "#2f8fbf", icon: "database" },
  learning: { accent: "#6a45c0", icon: "repeat" },
  extraction: { accent: "#0f9d8f", icon: "file" },
  frontend: { accent: "#c4314b", icon: "file" },
};
