export { ExtractionService, defaultExtractor, deterministicExtractor, generateCards } from "./workstream.js";
export type { ExtractionWorkstream, GenerateOptions, SourceDocument } from "./workstream.js";
export { EndpointExtractor, ENDPOINT_ENV, endpointConfigFromEnv } from "./endpoint.js";
export type { EndpointConfig, FetchLike } from "./endpoint.js";
export { formatReport, summarizeCards } from "./report.js";
export type { CorpusReport, ExtensionBreakdown } from "./report.js";
export { CARD_RULES, questionOverlap, rejectionSummary, validateCards } from "./validator.js";
export type { CardRule, Rejection, ValidationResult } from "./validator.js";
export { reportOnRepository } from "./corpus.js";
export {
  IGNORED_DIRECTORIES,
  SOURCE_EXTENSIONS,
  isGeneratedContent,
  isGeneratedPath,
  isGoTestPath,
  type QuestionExtractor,
} from "./extractor.js";
export {
  CompositeExtractor,
  ExportSignatureExtractor,
  GoDocExtractor,
  JsDocExtractor,
  MarkdownExtractor,
} from "./extractors.js";
