# Storage

`StorageService` in `src/workstream.ts` is the injected boundary the CLI composes. It owns the `.flashlearn/` layout and returns JSON-backed repositories.

| Method | Expected behavior |
| --- | --- |
| `initialize(root)` | Idempotently create `cards.json`, `review.json`, and `settings.json`. |
| `createCardRepository(root)` | Return a `CardRepository` scoped to the project's card file. |
| `createReviewRepository(root)` | Return a `ReviewRepository` scoped to the project's review file. |
| `CardRepository.save/get/list/delete` | Persist and retrieve cards according to `contracts/index.d.ts`. |
| `ReviewRepository.get/save` | Return a valid default state when absent and persist review state by card ID. |

Preserve atomic writes. Do not add scheduling or extraction decisions to this package.
