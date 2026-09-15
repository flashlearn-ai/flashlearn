export { ExtractionService, defaultExtractor, generateCards } from "./workstream.js";
export type { ExtractionWorkstream, SourceDocument } from "./workstream.js";
export { formatReport, summarizeCards } from "./report.js";
export type { CorpusReport, ExtensionBreakdown } from "./report.js";
export { reportOnRepository } from "./corpus.js";
export { IGNORED_DIRECTORIES, SOURCE_EXTENSIONS, type QuestionExtractor } from "./extractor.js";
export {
  CompositeExtractor,
  ExportSignatureExtractor,
  GoDocExtractor,
  JsDocExtractor,
  MarkdownExtractor,
} from "./extractors.js";
