# Storage Workstream

**Owner:** Sagar

`StorageService` is the production entrypoint for project initialization and repository creation. It returns JSON-backed implementations of the locked `CardRepository` and `ReviewRepository` contracts. The lower-level `initializeStore`, `JsonCardRepository`, and `JsonReviewRepository` exports remain available for existing integrations.

| Method | Expected behavior |
| --- | --- |
| `initialize(root)` | Idempotently create `cards.json`, `review.json`, and `settings.json`. |
| `createCardRepository(root)` | Return a `CardRepository` scoped to the project's card file. |
| `createReviewRepository(root)` | Return a `ReviewRepository` scoped to the project's review file. |
| `CardRepository.save/get/list/delete` | Persist and retrieve cards according to `contracts/index.d.ts`. |
| `ReviewRepository.get/save` | Return a valid default state when absent and persist review state by card ID. |

Preserve atomic writes. Do not add scheduling or extraction decisions to this package.

Storage owns the contents of `<projectRoot>/.flashlearn/`:

```text
.flashlearn/
  cards.json     # Card[]
  review.json    # ReviewState values keyed by card ID
  settings.json  # Local settings and schema version
```
