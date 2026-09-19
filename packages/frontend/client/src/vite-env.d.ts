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

/** Replaced with a literal at build time by `client/vite.config.ts`. True for
 *  the demo build and the dev server, false for a live build, and undefined
 *  under Node, where tests pass a deck source explicitly. */
declare const __ALLOW_FIXTURE__: boolean;
