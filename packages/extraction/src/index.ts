export { ExtractionService, defaultExtractor, generateCards } from "./workstream.js";
export type { ExtractionWorkstream, SourceDocument } from "./workstream.js";
export { IGNORED_DIRECTORIES, SOURCE_EXTENSIONS, type QuestionExtractor } from "./extractor.js";
export {
  CompositeExtractor,
  ExportSignatureExtractor,
  GoDocExtractor,
  JsDocExtractor,
  MarkdownExtractor,
} from "./extractors.js";
