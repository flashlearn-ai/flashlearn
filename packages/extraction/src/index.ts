export { ExtractionService, defaultExtractor } from "./workstream.js";
export type { ExtractionWorkstream, SourceDocument } from "./workstream.js";
export {
  generateCards,
  IGNORED_DIRECTORIES,
  SOURCE_EXTENSIONS,
  type QuestionExtractor,
} from "./extractor.js";
export { CompositeExtractor, JsDocExtractor, MarkdownExtractor } from "./extractors.js";
