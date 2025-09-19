# Repository Guidelines

> Before diving in, read the product vision in [`VISION.md`](VISION.md); all contributor decisions should reinforce that mission.

## Project Structure & Module Organization
- Core source lives in `scripts/`; group features by domain and keep shared helpers in `scripts/lib/`.
- Tests sit in `tests/` with fixtures, mirroring the source tree for easy cross-reference.
- UI assets live in `styles/`, `templates/`, and `assets/`. Generated bundles appear in `dist/` and should never be edited directly.
- Module metadata stays in `module.json`. Architecture resources (`Simulacrum FoundryVTT Architecture.svg`, `architecture-overview.txt`) capture deeper design context.

## Build, Test, and Development Commands
- `npm test` runs the Jest suite once in jsdom.
- `npm run test:watch` keeps Jest hot during iterative work.
- `npm run lint` and `npm run lint:check` apply ESLint rules across `scripts/`.
- `npm run format` formats JavaScript, tests, JSON, and Markdown via Prettier; use `format:check` in CI or before PRs.
- `npm run package:module` assembles a Foundry-ready ZIP in `dist/`.
- `npm run deploy:module` pushes the packaged module to the configured Foundry instance.
- Configure the AI endpoint via the module settings: select `OpenAI-compatible` or `Gemini-compatible`, set the appropriate base URL (`https://api.openai.com/v1` or `https://generativelanguage.googleapis.com/v1beta`), and provide the matching API key (`Authorization` bearer token for OpenAI-based hosts, `x-goog-api-key` for Gemini).

## Coding Style & Naming Conventions
- Use ES modules, 2-space indentation, camelCase for functions and variables, PascalCase for classes, and kebab-case filenames under `scripts/`.
- Keep functions short and pure; contain side effects near orchestration layers. Add JSDoc when behavior requires context.
- ESLint and Prettier configurations in the repo are the authoritative style guides—run both before opening a PR.

## Testing Guidelines
- Place Jest specs under `tests/` named `*.spec.js`; co-locate fixtures alongside them.
- Cover new behavior with unit tests first; keep coverage at or above the level enforced by `npm run test:coverage`.
- When updating Foundry integrations, add high-level flow tests or mocks that assert emitted events.

## Commit & Pull Request Guidelines
- Follow the Conventional Commit-inspired prefixes (`feat`, `fix`, `chore`, `docs`, etc.) and keep subject lines under 72 characters.
- Describe behavioral impact in the body and cite related issues when available.
- Pull requests should list verification steps (`npm test`, `npm run lint`) and attach UI screenshots or GIFs for user-facing changes.

## Systems Overview
- Review `Simulacrum FoundryVTT Architecture.svg` for the high-level systems diagram covering the Conversation Engine, Knowledge Graph, and Foundry bridge.
- The Conversation Engine drives agent workflows and pulls canon data from the Knowledge Graph assets in `reference/` and `lang/`.
- Processed updates flow through the Foundry bridge (`tools/launch-foundry.js`, `scripts/simulacrum.js`) into the VTT, while session logs feed back into `dist/` exports to close the loop.
