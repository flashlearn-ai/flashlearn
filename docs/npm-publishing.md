# npm Publishing Strategy

## Goal

Make FlashLearn installable and runnable as a normal command without exposing internal workspace boundaries prematurely.

Target user experience:

```bash
npx flashlearn init
npx flashlearn generate .
npx flashlearn start
```

Optional global installation:

```bash
npm install --global flashlearn
flashlearn --help
```

## Current State

The repository is not ready to publish as-is:

- The root package is named `flashlearn`, but is marked `private` and has no executable.
- All five workspace packages are private and versioned `0.0.0`.
- `@flashlearn/cli` declares a `flashlearn` binary at `dist/index.js`.
- A clean `npm pack --dry-run --workspace @flashlearn/cli` includes source and tests but no `dist/`, so the published binary would be missing.
- The CLI has runtime dependencies on four private workspace packages.
- Generated declarations reference the root `contracts/` directory, which would not exist in an independently installed package.
- Package metadata does not yet include license, repository, homepage, keywords, supported files, or publish settings.
- Neither `flashlearn` nor `@flashlearn/cli` currently resolves as a public npm package. Availability must still be confirmed while authenticated before relying on either name.

## Options

### Option A: Publish One Bundled CLI Package

Publish one public package named `flashlearn`. Bundle the five workspace implementations and shared contracts into one self-contained executable artifact.

```text
repository workspaces
  -> build and bundle
  -> flashlearn npm package
     dist/index.js
     README.md
     LICENSE
     package.json
```

Advantages:

- Users install one package.
- Internal workspaces can remain private and independently owned.
- No cross-package version synchronization is required.
- Root-relative contract declarations do not leak into an installed package.
- Internal package boundaries can change without creating public npm compatibility commitments.

Tradeoffs:

- Requires a bundling step, such as esbuild.
- Internal packages are not directly available as an SDK.
- Notices and licenses for bundled dependencies must be respected if third-party runtime dependencies are added.

### Option B: Publish All Five Packages

Publish `@flashlearn/cli`, `@flashlearn/extraction`, `@flashlearn/storage`, `@flashlearn/learning`, and `@flashlearn/frontend` under an npm organization scope.

Advantages:

- Consumers can replace or reuse individual implementations.
- Package boundaries are visible and independently versionable.
- The CLI can remain a small composition package.

Tradeoffs:

- Every internal API becomes a public compatibility surface.
- A sixth publishable contracts package or duplicated declarations would be required.
- Releases must coordinate compatible versions across packages.
- Installation, provenance, access, and deprecation must be managed for five packages.
- The current one-package-per-change model makes coordinated public contract releases more involved.

### Option C: Publish CLI Plus a Contracts SDK

Publish a bundled `flashlearn` CLI and a separate `@flashlearn/contracts` package for integrations.

This can be useful later if external plugins need the stable models without depending on implementations. It should not be created until a real external consumer exists because the project currently intends to have exactly five implementation packages.

## Recommendation

Start with **Option A: one bundled public `flashlearn` package**.

Keep all five workspace packages private. Treat them as repository architecture rather than npm products. Revisit a contracts SDK or public workspaces only after there is a concrete plugin or library use case.

The published package can be produced from `packages/cli` or a dedicated release staging directory. A staging directory avoids renaming the private root workspace and makes tarball contents explicit:

```text
.release/npm/
  package.json
  README.md
  LICENSE
  dist/index.js
```

Do not commit generated `.release/` contents. Build them during release verification.

## Proposed Package Metadata

The staged package should resemble:

```json
{
  "name": "flashlearn",
  "version": "0.1.0",
  "description": "Turn a Git repository into source-attributed study cards.",
  "type": "module",
  "bin": {
    "flashlearn": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=22"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/flashlearn-ai/flashlearn.git"
  },
  "homepage": "https://github.com/flashlearn-ai/flashlearn#readme",
  "bugs": {
    "url": "https://github.com/flashlearn-ai/flashlearn/issues"
  },
  "keywords": [
    "flashcards",
    "spaced-repetition",
    "developer-tools",
    "git"
  ],
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

Add a license before publishing and ensure the `license` package field matches it. MIT is a common choice, but the repository owner must make that decision.

## Build Design

Bundle from the CLI entrypoint:

```bash
esbuild packages/cli/src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node22 \
  --outfile=.release/npm/dist/index.js \
  --banner:js='#!/usr/bin/env node'
```

The release build should:

1. Remove and recreate the temporary staging directory.
2. Bundle the CLI and internal package implementations.
3. Copy the user-facing README and license.
4. Generate package metadata using the release version.
5. Ensure `dist/index.js` is executable in the tarball.
6. Run `npm pack --dry-run` from the staging directory.
7. Create the tarball and install it into a temporary directory.
8. Run the installed binary with `--help`, `--version`, and `init`.

Do not rely only on repository tests. Tarball installation catches missing files, incorrect `bin` paths, executable-mode problems, accidental source publication, and unresolved workspace imports.

## Versioning

Use semantic versioning for the public CLI:

- Patch: fixes that preserve commands, files, and persisted data.
- Minor: backward-compatible commands, options, endpoints, or capabilities.
- Major: breaking CLI behavior, persisted-data changes without migration, removed options, or incompatible runtime requirements.

Start with `0.1.0` while the product is in active development. During `0.x`, still document breaking changes clearly rather than treating every minor release as disposable.

The CLI version should come from generated package metadata or a build-time constant. Avoid maintaining unrelated version strings manually in multiple source files.

## Release Automation

Use GitHub Actions with npm trusted publishing and provenance rather than a long-lived `NPM_TOKEN` when the npm organization and repository support it.

Recommended release trigger:

```text
merge release version change
  -> create GitHub release or version tag
  -> verify tag matches package version
  -> npm ci
  -> npm run check
  -> build release staging directory
  -> tarball install smoke test
  -> npm publish --provenance --access public
```

The publish job should use:

```yaml
permissions:
  contents: read
  id-token: write
```

Protect the npm publishing environment in GitHub. Require approval for the first releases if desired. Never publish from a developer laptop as the normal release path.

## Release Tooling Choices

### npm Version

Use `npm version` and manually authored GitHub releases.

Best when releases are infrequent and one person owns them. It has the least setup but relies on process discipline.

### Changesets

Use Changesets to collect release notes and automate version pull requests.

Best if multiple contributors regularly ship user-visible changes. It also leaves a path to publishing multiple packages later. It adds contributor workflow and configuration that may be unnecessary during the prototype phase.

### Release Please

Use conventional commits to maintain a release PR and changelog.

Best if the team consistently follows conventional commit messages. It is less explicit per change than Changesets but can make releases nearly automatic.

Recommendation: begin with a small manually triggered or tag-triggered workflow. Adopt Changesets when release frequency or contributor coordination makes manual release notes painful.

## Security And Access

Before the first publish:

1. Create or confirm the npm organization and package ownership.
2. Require two-factor authentication for npm maintainers.
3. Configure trusted publishing for the exact GitHub workflow and environment.
4. Limit publish permissions to the release environment.
5. Enable npm provenance.
6. Confirm package-name availability while authenticated.
7. Review the packed file list and dependency licenses.
8. Publish `0.1.0` only after installing and testing the exact tarball.

Avoid lifecycle scripts in the published package unless required. The repository-level Husky `prepare` script must not appear in the staged public package.

## Suggested Scripts

These root scripts are a possible implementation shape:

```json
{
  "scripts": {
    "release:build": "node scripts/build-release.mjs",
    "release:check": "npm run check && npm run release:build && node scripts/test-release.mjs",
    "release:pack": "npm pack ./.release/npm",
    "release:publish": "npm publish ./.release/npm --access public --provenance"
  }
}
```

Keep release scripts separate from normal workspace builds. `npm run build` should continue serving contributors and CI; `release:build` should create only the public artifact.

## Phased Plan

### Phase 1: Make a Valid Tarball

- Choose and add a license.
- Confirm the `flashlearn` package name and npm ownership.
- Add a release bundler and staging script.
- Add explicit public package metadata and `files` allowlist.
- Install the tarball in a temporary project and test `flashlearn --help`, `--version`, and `init`.

### Phase 2: Publish Prereleases

- Publish `0.1.0-next.0` with the `next` dist-tag.
- Test `npx flashlearn@next --help` on Linux, macOS, and Windows.
- Exercise `init`, `generate`, and `start` against a sample repository.
- Verify provenance on npm.

### Phase 3: Publish Stable

- Promote a tested release to `0.1.0` under the `latest` dist-tag.
- Create matching GitHub tag and release notes.
- Document install, upgrade, and issue-reporting instructions.
- Monitor installation failures and command startup errors.

### Phase 4: Evaluate Public SDK Packages

- Gather concrete extension use cases.
- Decide whether consumers need contracts only or package implementations.
- If needed, design a public `@flashlearn/contracts` API before exposing implementation packages.
- Introduce coordinated workspace versioning only when justified by external consumers.

## First-Release Definition Of Done

- `npm pack --dry-run` includes only intended files.
- The tarball installs without workspace or root-relative imports.
- `npx flashlearn --help` and `npx flashlearn --version` work.
- `flashlearn init` creates the three expected files.
- `generate` and `start` pass end-to-end tests with completed package implementations.
- The public README documents install, commands, Node support, local files, and data privacy.
- License, repository, bugs, and homepage metadata are present.
- Publishing occurs through protected GitHub Actions trusted publishing.
- npm displays provenance for the release.
- The GitHub release tag exactly matches the npm version.

## Open Decisions

1. Is the unscoped `flashlearn` name available to the team when authenticated?
2. Which license should govern the public package?
3. Should the first release wait for all five owner workstreams, or publish a clearly labeled preview?
4. Should release creation be manual, tag-driven, Changesets-based, or Release Please-based?
5. Does the team expect third-party plugins soon enough to justify a contracts SDK?
