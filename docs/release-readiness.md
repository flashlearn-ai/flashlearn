# npm and GitHub Pages release runbook

This repository produces two release artifacts from the five private workspaces:

- `.release/flashlearn.tgz`: self-contained `@flashlearnai/cli` package with the `flashlearn` executable/server plus the live React client.
- `.release/site/`: landing page, tool documentation, and, only when built with `--demo`, the sample-only web demo.

## Local verification

```bash
npm ci
npm run release:check
npm run site:build -- --demo
npm exec --workspace @flashlearn/frontend -- playwright install --with-deps chromium
npm run test:browser:live --workspace @flashlearn/frontend
npm run site:test
npm run site:preview
```

The preview is `http://127.0.0.1:4182/flashlearn/`. It deliberately includes the repository subpath used on Pages.

`release:check` runs workspace checks, builds the live UI/server, bundles the CLI, creates the tarball, installs it outside the monorepo, and verifies version/help, generation, queries, static assets, and persisted review state. It writes a SHA-256 receipt for the tested artifact. It never publishes.

`test:browser:live` requires the live build produced above (or `npm run build --workspace @flashlearn/frontend`). It tests desktop/mobile live study against the real frontend server with package-local injected services: reveal, due selection, reloads, retries, pending saves, immediate incorrect-card repeats, future-card exclusion, and the 12-review cap. Disk persistence and the real learning algorithm remain integration-test responsibilities. `site:test` checks the separately built Pages/demo artifacts.

## Frontend outputs

| Build | Output | Deck and reviews |
| --- | --- | --- |
| `npm run build --workspace @flashlearn/frontend` | `packages/frontend/client/dist/` | Two entry routes (server-selected due cards, or a client-dealt topic session), mixed choice/recall presentation, persisted schedules, up to 12 acknowledged reviews |
| `npm run demo --workspace @flashlearn/frontend` | `packages/frontend/client/dist-demo/` | Public sample multiple choice, topic-balanced sessions up to 12 cards, session-only reviews, no API calls |

Official builds explicitly select their source even when `VITE_DECK_SOURCE` is set in the shell. Development source overrides remain available in ordinary Vite dev mode. Building one artifact never overwrites the other. `node scripts/test-build-modes.mjs` verifies both orders and hostile environment overrides.

Live study uses `GET /api/cards` for counts, `GET /api/project` for the deck's project name when one is declared, `GET /api/cards/next` for selection, and `GET /api/cards/:id` for a card that became due after the deck loaded. Topic sessions are dealt client-side and are early reviews, never the due queue; the next-card endpoint has no topic filter. All four ratings post to `POST /api/review`; the UI waits for confirmation and an explicit **Next due card** click before advancing. Pending saves say **Saving review…**. Failed or malformed acknowledgements block advancement/new sessions and allow retry of the same rating; a lost response may follow a successful save, and retry can duplicate it because the contract has no idempotency key. Reload resets the transcript but uses persisted server schedules; future cards remain excluded, a next-card `404` means none are due, and immediately due incorrect-card repeats count toward the cap.

## Pages site

`site/` contains the static hero and docs. `site:build` copies these templates and stamps the version from `release/package.json`. The sample demo is opt-in: `npm run site:build -- --demo` also builds it and copies **only** that build under `/demo/`. Pages deployment and release-artifact CI explicitly enable `--demo`, publishing the hero, docs, and sample demo at `https://flashlearn-ai.github.io/flashlearn/demo/`. A local build without the flag still omits the demo. Demo-only markup in the templates is fenced with `<!--DEMO-->`, and its replacement with `<!--NODEMO-->`, so links and artifacts are decided together and the site never publishes a link to a page it did not build. Assets are relative, and `/docs/` and `/demo/` each have an index document so reloads work without a server-side router.

The hero emphasizes three stages:

1. **Source:** knowledge from repositories and existing project content; wiki connectors are planned.
2. **Generate:** actionable, contextualized snippets that build project understanding and familiarity.
3. **Learn:** regular, gamified spaced repetition integrated into daily work; the Teams-style UI works today, while native Teams, GitHub, and Slack delivery integrations are planned.

Do not present roadmap connectors as installed integrations. The demo uses the existing hand-authored sample deck, whose citations are checked against public source. Multiple-choice sessions balance selected topics, rotate the starting topic when topics outnumber the 12 slots, and advance each topic by cards actually dealt. It never reads a local repository or makes API requests; ratings and topic/card cursors reset on reload, with no persisted schedule.

### Enable deployment

1. Merge the workflow and select **Settings → Pages → Source: GitHub Actions**.
2. Allow the `github-pages` environment to deploy from `main`.
3. Run **GitHub Pages** manually on `main`, or push a change to `main`.
4. The build job builds and browser-tests `.release/site`, then uploads only that directory.
5. The deployment job uses `actions/deploy-pages` and reports the actual site URL; normally `https://flashlearn-ai.github.io/flashlearn/`.

Feature-branch manual runs may build the site but cannot deploy. PR artifact checks never publish.

## npm artifact

`release/package.json` is the public manifest and release version source: `@flashlearnai/cli@0.4.0`, with the `flashlearn` executable and MIT licensing. The root and all implementation workspaces (including the internal `@flashlearn/cli` workspace) remain private. Publish the release tarball, not a workspace or repository directory.

```text
.release/npm/
  package.json
  README.md
  LICENSE
  THIRD_PARTY_NOTICES.txt
  dist/index.js
  client/dist/...
```

The wrapper reports the public manifest version; all other commands delegate to the existing bundled CLI. Node built-ins remain external. The build rejects unresolved non-builtin imports. The frontend resolves `../client/dist/` relative to the installed bundle, not the user's working directory. Browser dependencies carry upstream React/ReactDOM/scheduler notices.

For checkout development, `npm link` at the repository root exposes the same `flashlearn` executable under the published package name. Its source launcher rebuilds stale workspace outputs and preserves the caller's working directory.

The allowlisted tarball contains no workspace sources, development tooling, Husky setup, or private package dependencies. Installing it requires Node.js 22.14+; Git is required for commit attribution. Installed command behavior is documented in `release/README.md` and `/docs/` on the site. CLI changes must update both in the same PR.

### CLI behavior to verify before release

- Generation caps new/updated cards at 100 per run and reports scan/selection/generation/category/save progress on stderr. Existing decks are not pruned. `generate --copilot` opts in with `auto` fast routing; `--copilot-model <name>` overrides the model. Explicit Copilot takes precedence over endpoint environment variables. Classification prioritizes relevant sources and groups code/docs into up to eight parallel four-file batches with 7,000-character excerpts. Generation and category calls allow five minutes each. Completed batches and categorized results are atomically checkpointed until card saves finish; matching retries resume without repeating successful inference, while changed source content invalidates stale work. `generate --fresh` starts over. Validate category-timeout, failed-batch and card-save recovery, credential omission and clean error-line formatting. Categories still require at least five cards; unfinished candidates are not study cards. Offline/legacy cards retain path grouping. No filler is added. Run `node packages/cli/scripts/benchmark-generation.mjs /path/to/repo auto --keep` after building; the one-minute metric is informational now.

- Every command defaults to cwd. `--project`/`-p` selects a directory for one invocation; relative paths resolve against cwd. Positional directories remain supported for `init`, `generate`, and `start`, mutually exclusive with `--project`.
- `FLASHLEARN_PROJECT` and legacy saved user configuration are ignored and left untouched. `project set` returns exit code 2 with migration guidance. `project show` reports this invocation's directory; `init` only initializes storage.
- Recommend `generate` → `start`: generation automatically initializes missing storage; `init` is optional. Empty-deck startup prompts in a terminal (default no), or exits 1 with guidance non-interactively. `start --yes`/`-y` approves generation, including use of a configured endpoint. Existing decks are not regenerated. Failed generation or a still-empty deck prevents startup.
- `generate --subpath src --max-files 20` scopes extraction without changing the project root or attribution. The subpath must be a repository-relative directory without `..`; the file limit must be a positive safe integer, applied to eligible ranked documents after scanning. These flags are generation-only. Generation upserts rather than pruning and exits 1 if no study cards remain available.
- Queries support `-o, --output text|json|yaml`. Project diagnostics and generation progress go to stderr. For source-runner JSON/YAML, use `npm --silent run cli -- project status --project /path/to/repo -o json`; the runner uses the repository root as cwd and ensures sibling build outputs are ready.
- Offline extraction stays local. Interactive generation may detect and offer `copilot -p`, or collect current-run-only credentials for OpenAI, Claude, or a custom endpoint. It clearly calls out deterministic fallback. Any selected AI provider receives code and has access controls and retention separate from repository permissions.

For stacked PRs, each documentation change must describe behavior available with that PR and its merged base. Document later frontend changes with their owning PR. Owner workstream completion requires the agreed deliverable to be completed and merged, not just passing tests.

## npm account setup and first publication

The public package is [`@flashlearnai/cli`](https://www.npmjs.com/package/@flashlearnai/cli). Keep `release/package.json`, the manifest validator, install examples, and npm trusted-publisher configuration aligned with that scope. The installed executable remains `flashlearn`.

### Releases with OIDC

Configure npm trusted publishing for:

- GitHub organization: `flashlearn-ai`
- Repository: `flashlearn`
- Workflow filename: `publish.yml`
- Environment: `prod`
- Allowed action: direct `npm publish`

Current npm OIDC support requires npm 11.5.1+ and Node 22.14+. The workflow pins npm 11.12.1 and uses Node 24 on a GitHub-hosted runner. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers).

The package already has an owner-published release. Configure the trusted publisher on `@flashlearnai/cli` and the GitHub `prod` environment. No registry credentials or account changes are performed by these scripts.

In npm, open the package **Settings → Trusted publishing**, choose GitHub Actions, and enter the values above. The npm organization (`flashlearnai`) and GitHub organization (`flashlearn-ai`) are different names. In GitHub **Settings → Environments**, use `prod`; if deployment branch/tag restrictions are enabled, allow version tags such as `v*`, since release jobs run against tags. Optional required reviewers must approve the deployment before publishing starts. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed; `id-token: write` enables npm's OIDC exchange.

## Release workflow

1. Update `release/package.json` in a reviewed commit on `main`; keep install examples and site docs synchronized.
2. Run `release:check` and inspect `.release/artifact.json`.
3. Open **Actions → Create release → Run workflow**, selecting `main`. No version or tag input is needed. The workflow validates the release artifact, reads `release/package.json`, derives `v<version>` and the prerelease flag, and creates the tag at the exact workflow commit. For CLI use: `gh workflow run create-release.yml --ref main`.
4. The creation workflow publishes generated release notes and explicitly dispatches **npm release** (`publish.yml`) with the derived tag. This explicit dispatch is necessary because `GITHUB_TOKEN`-created releases do not trigger downstream `release` events. The existing `release: published` trigger also remains available for releases created through the UI or a personal authenticated account. Drafts, edits, and tag pushes alone do not publish.
5. The workflow checks out the release tag, verifies tag/version/prerelease agreement and that the tagged commit is on `main`, then rebuilds, packs, and installs/tests the artifact.
6. It verifies both artifact receipts and publishes the exact `.tgz` using OIDC with provenance: prereleases use `next`, stable versions use `latest`. It verifies the registry's SHA-512 integrity afterward.
7. The final job attaches `flashlearn.tgz` and `artifact.json` to the existing GitHub Release. The workflow does not create another release.

If creation succeeds but dispatch fails, rerun that **Create release** run: it reuses the same tag/release and dispatches again. An existing tag at a different commit is rejected rather than moved; use **npm release** to retry the existing release, or bump the manifest for a new one. Creation requires `contents: write` and `actions: write` on the built-in token. npm trusted publishing remains tied to `publish.yml` and the `prod` environment.

If publication or attachment fails, use **Actions → npm release → Re-run failed jobs** (or **Re-run all jobs**) on the original run. Alternatively, choose **Run workflow**, select `main`, and enter the existing published release tag (for example `v0.2.0`). From the CLI:

```bash
gh workflow run publish.yml --ref main -f tag=v0.2.0
```

Manual runs fetch the release from GitHub, check out its tag, and run the same version/prerelease/main-ancestry and artifact checks as the release trigger. They can retry tags that predate manual dispatch because the workflow resolves metadata before checking out the target tag. The tag must have a published, non-draft GitHub Release. If `prod` has deployment restrictions, allow the dispatch branch (`main`) as well as release tags; checkout does not change the workflow's triggering ref.

Publishing tooling is checked out from the workflow commit in `release-tools/`; tagged source and tested artifacts live in `release-source/`. `FLASHLEARN_RELEASE_ROOT` selects the source/artifact root and `FLASHLEARN_RELEASE_EVENT` carries resolved release metadata. Never override `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REF`, or `GITHUB_SHA`: npm provenance must agree with the actual OIDC claims, including `workflow_dispatch` on `main` for a manual retry. Release validation is independent of that authentic workflow context.

After npm accepts publication, the workflow polls the registry for up to five minutes, with ten-second pauses and progress logs, until the published integrity matches the tested tarball. Registry 404s, network/response failures, HTTP 408/429 and 5xx responses are retried within that budget; authentication failures and artifact mismatches fail immediately. Verification never republishes. If processing exceeds the deadline, rerun later to verify the already-submitted version rather than bumping solely for propagation delay.

An existing npm version is skipped only when its registry integrity matches the freshly tested tarball exactly; differing bytes fail and require a new version. A retry does not change dist-tags or add provenance to an existing manual publication. The final job uploads the tested tarball and receipt to the selected release. A GitHub Release becomes visible before npm publication completes; check the workflow result before announcing availability.

The workflow requires the `prod` environment and npm trusted publisher to be configured by the owner. No long-lived npm token is used. Provenance is verified on the registry after a real release; it cannot be proven by a local dry run.

Published versions are immutable. Repair a bad release with a new version or a deliberate dist-tag rollback; never try to overwrite a version.

## CI coverage

The **Release artifacts** workflow tests tarball installation on Linux, macOS, and Windows. Its Pages job verifies build isolation and browser behavior under `/flashlearn/`. The normal CI still runs workspace tests, typechecking, scope, and generated-content gates. Release artifact jobs on PRs do not deploy or publish.

Root workspace tests run through `scripts/test-workspaces.mjs`, which removes inherited `GIT_*` variables from the child environment. Tests that initialize temporary repositories cannot accidentally target the caller's worktree when run from a Git hook.

## Maintenance

- `site/index.html`: project narrative and honest current/planned integration claims.
- `site/docs/index.html`: installed commands, configuration, privacy boundaries, and demo behavior.
- `release/README.md`: npm consumer instructions.
- `release/package.json`: public version/metadata.
- `AGENTS.md`: requires documentation updates in the same change as affected behavior.

Update these artifacts together when commands, endpoints, installation, supported sources, configuration, or integrations change. Build/test tooling is implemented here; actual Pages deployment and npm publication remain owner-triggered operations.
