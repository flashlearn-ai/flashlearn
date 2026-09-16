/// <reference types="vite/client" />

/**
 * Build-time configuration. `VITE_DECK_SOURCE` selects where the app loads
 * cards from; see `src/deckSource.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_DECK_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
