# HTTP Contract

All responses use `application/json`. Errors have the shape `{ "error": "message" }`.

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/cards/next` | `CardPreview`, or `404` when no card is due |
| `GET` | `/api/cards/:id` | `Card`, or `404` |
| `POST` | `/api/review` | Body: `SubmitReviewRequest`; response: `ReviewState` |
| `GET` | `/api/cards` | `Card[]` |
| `GET` | `/api/project` | `ProjectIdentity`; `name` is null when the project declares none |

The accepted review results are `easy`, `hard`, `correct`, and `incorrect`.
