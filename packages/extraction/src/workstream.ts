import type { GeneratedCard } from "../../../contracts/index.js";

export type SourceDocument = {
  path: string;
  content: string;
  sha: string;
};

/** Repository ingestion and generation operations owned by extraction. */
export interface ExtractionWorkstream {
  scanRepository(root: string): Promise<SourceDocument[]>;
  generateFromDocument(document: SourceDocument): Promise<GeneratedCard[]>;
  generateFromRepository(root: string): Promise<GeneratedCard[]>;
}

/** Manasa: fill in repository scanning and question generation here. */
export class ExtractionService implements ExtractionWorkstream {
  async scanRepository(_root: string): Promise<SourceDocument[]> {
    // TODO(Manasa): read supported source files and attach path and Git SHA.
    return [];
  }

  async generateFromDocument(_document: SourceDocument): Promise<GeneratedCard[]> {
    // TODO(Manasa): generate questions and answers for one document.
    return [];
  }

  async generateFromRepository(_root: string): Promise<GeneratedCard[]> {
    // TODO(Manasa): scan, generate from each document, and combine results.
    return [];
  }
}
