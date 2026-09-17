# npm and GitHub Pages release runbook

This repository produces two release artifacts from the five private workspaces:

- `.release/flashlearn.tgz`: self-contained `flashlearn` CLI/server plus the live React client.
- `.release/site/`: landing page, tool documentation, and the sample-only web demo.

## Local verification

```bash
npm ci
npm run release:check
npm run site:build
npm exec --workspace @flashlearn/frontend -- playwright install --with-deps chromium
npm run site:test
npm run site:preview
```

The preview is `http://127.0.0.1:4182/flashlearn/`. It deliberately includes the repository subpath used on Pages.

`release:check` runs workspace checks, builds the live UI/server, bundles the CLI, creates the tarball, installs it outside the monorepo, and verifies version/help, generation, queries, static assets, and persisted review state. It writes a SHA-256 receipt for the tested artifact. It never publishes.

## Frontend outputs

| Build | Output | Deck and reviews |
| --- | --- | --- |
| `npm run build --workspace @flashlearn/frontend` | `packages/frontend/client/dist/` | Live API-backed client |
| `npm run demo --workspace @flashlearn/frontend` | `packages/frontend/client/dist-demo/` | Public sample deck, session-only reviews, no API calls |

Official builds explicitly select their source even when `VITE_DECK_SOURCE` is set in the shell. Development source overrides remain available in ordinary Vite dev mode. Building one artifact never overwrites the other. `node scripts/test-build-modes.mjs` verifies both orders and hostile environment overrides.

## Pages site

`site/` contains the static hero and docs. `site:build` copies these templates, stamps the version from `release/package.json`, and copies **only** the demo build under `/demo/`. Assets are relative, and `/docs/` and `/demo/` each have an index document so reloads work without a server-side router.

The hero emphasizes three stages:

1. **Source:** knowledge from repositories and existing project content; wiki connectors are planned.
2. **Generate:** actionable, contextualized snippets that build project understanding and familiarity.
3. **Learn:** regular, gamified spaced repetition integrated into daily work; the Teams-style UI works today, while native Teams, GitHub, and Slack delivery integrations are planned.

Do not present roadmap connectors as installed integrations. The demo uses the existing hand-authored sample deck, whose citations are checked against public source. It never reads a local repository or contacts a model endpoint, and ratings reset on reload.

### Enable deployment

1. Merge the workflow and select **Settings → Pages → Source: GitHub Actions**.
2. Allow the `github-pages` environment to deploy from `main`.
3. Run **GitHub Pages** manually on `main`, or push a change to `main`.
4. The build job builds and browser-tests `.release/site`, then uploads only that directory.
5. The deployment job uses `actions/deploy-pages` and reports the actual site URL; normally `https://flashlearn-ai.github.io/flashlearn/`.

Feature-branch manual runs may build the site but cannot deploy. PR artifact checks never publish.

## npm artifact

`release/package.json` is the public manifest and release version source. The root and all implementation workspaces remain private. The initial version is `0.1.0-next.0`, with MIT licensing approved by the project owner.

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

The allowlisted tarball contains no workspace sources, development tooling, Husky setup, or private package dependencies. Installing it requires Node.js 22.14+; Git is required for commit attribution. Current installed command behavior is documented in `release/README.md` and `/docs/` on the site. Pending CLI changes must update both when they merge.

## npm account setup and first publication

The proposed name is `flashlearn`; registry lookup currently returns 404, which does not establish account ownership or reserve the name. An npm owner must confirm control of this name, or change `release/package.json`, the manifest validator, and documented installation name to an owned scope before publishing.

Configure npm trusted publishing for:

- GitHub organization: `flashlearn-ai`
- Repository: `flashlearn`
- Workflow filename: `npm-release.yml`
- Environment: `npm-publish`
- Allowed action: direct `npm publish`

Current npm OIDC support requires npm 11.5.1+ and Node 22.14+. The workflow pins npm 11.12.1 and uses Node 24 on a GitHub-hosted runner. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers).

For a brand-new package, complete npm's owner-authenticated first-publication/bootstrap process if package settings are not available yet. Use the exact packed/tested artifact, select `next` for a prerelease, and then configure the trusted publisher for subsequent releases. Do not assume an unregistered package can receive its first OIDC publish. No registry credentials or account changes are performed by these scripts.

## Release workflow

1. Update `release/package.json` in a reviewed commit on `main`; keep install examples and site docs synchronized.
2. Run `release:check` and inspect `.release/artifact.json`.
3. Create/push the matching tag, for example `v0.1.0-next.0`, once account setup is complete.
4. **npm release** verifies tag/version agreement and that the tagged commit is on `main`.
5. It rebuilds, packs, and installs/tests the artifact, then verifies its digest immediately before publishing.
6. It publishes the exact `.tgz` with provenance: prereleases use `next`, stable versions use `latest`.
7. A separate job creates matching GitHub release notes after publication succeeds.

The workflow requires the `npm-publish` environment and npm trusted publisher to be configured by the owner. No long-lived npm token is used. Provenance is verified on the registry after a real release; it cannot be proven by a local dry run.

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
