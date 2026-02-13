# AGENTS.md

This file guides agentic coding tools working in this repository.

## Project Overview

- Package: `@thesammykins/discord_opencode`
- Runtime: Bun (required for `bun:sqlite`)
- Language: TypeScript (ESM)
- Plugin entry: `src/index.ts`

## Commands

Run from repo root.

- Install: `npm install`
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Dev watch: `npm run dev`
- Test: `npm test` (runs `bun test`)
- Lint: none configured

### Single Test

- Use `bun test --filter <name>` to run a single test.

## Repository Layout

- `src/index.ts`: Tool definitions and main plugin entry
- `src/config.ts`: Environment-based configuration
- `src/schema.ts`: SQLite schema bootstrap and migration
- `src/validation.ts`: Discord limit validation helpers
- `src/file-sandbox.ts`: File access security
- `src/cli/setup.ts`: npx setup CLI command
- `src/types/bun.d.ts`: Types for `bun:sqlite`
- `tests/unit/`: Unit tests (always run)
- `tests/e2e/`: E2E tests (gated on Discord env vars)
- `dist/`: Build output (generated)

## Code Style Guidelines

Follow existing patterns in `src/index.ts` and related files.

### TypeScript & ESM

- Use ESM imports with explicit `.js` extensions for local files.
  - Example: `import { loadConfig } from './config.js';`
- Use `node:` prefix for Node built-ins.
  - Example: `import { execSync } from 'node:child_process';`
- Keep `strict` TypeScript compatibility (see `tsconfig.json`).
- Avoid `any` unless necessary. If needed, confine it to narrow scopes.
- Prefer `interface` for object shapes used across functions.

### Imports

- Order imports by: Node built-ins, external deps, local modules.
- Group external imports in a single block when possible.
- Keep named imports sorted logically (not necessarily alphabetized).

### Naming

- `camelCase` for functions and variables.
- `PascalCase` for types/interfaces/classes.
- `UPPER_SNAKE_CASE` for constants.
- Tool names are snake_case strings (match OpenCode tool naming).

### Functions & Structure

- Keep helpers near their usage (top of file for shared helpers).
- Use small helper functions for repeated logic.
- Prefer early returns to reduce nesting.

### Error Handling

- Throw `Error` for invalid state (e.g., invalid channel ID).
- Return user-facing error strings from tool handlers when appropriate.
- Avoid empty catch blocks. Always log or return a useful message.

### Discord.js Usage

- Always validate channel type before use (`isTextBased()` / `isThread()`).
- Cast to `TextChannel` or `ThreadChannel` after validation.
- Respect Discord limits using helpers in `src/validation.ts`.

### File Access & Security

- Use `validateFileAccess` before reading or sending files.
- Do not widen sandbox paths without config changes.
- Enforce size limits (`DISCORD_OPENCODE_MAX_FILE_SIZE`).

### Configuration

- Read config via `loadConfig()` only.
- All environment-driven defaults live in `src/config.ts`.
- Avoid hardcoded paths in tool logic.

### Tool Definitions

- Tools are registered via `tool({ ... })` from `@opencode-ai/plugin`.
- Use `tool.schema` for arg validation and descriptions.
- Return JSON strings for structured responses used by other tools.

## Allowed Tools

- `send_discord_message`
- `send_embed`
- `send_buttons`
- `await_button_click`
- `update_status`
- `send_file`
- `start_typing`
- `reply_to_message`
- `delete_message`
- `edit_message`
- `add_reaction`
- `rename_thread`
- `create_thread_for_conversation`
- `get_thread_history`
- `get_session_context`
- `request_human_input`
- `request_approval`
- `notify_human`
- `approve_remote_session`
- `get_system_status`
- `get_discord_health`
- `list_projects`
- `run_project_command`

## Formatting

- Keep lines readable; wrap long argument objects across lines.
- Use trailing commas in multi-line arrays/objects.
- Prefer single quotes for strings.

## Build Outputs

- `dist/` is generated; do not edit manually.
- Keep `dist/` in git if release packaging expects it.

## CI/CD

- Workflows: `.github/workflows/ci.yml` and `publish.yml`.
- Publish uses trusted publishing with `npm publish --provenance`.
- Publish triggers on `v*` tags pushed to `main`.

## Releases

Every release **must** include a `CHANGELOG.md` entry before tagging.

### Changelog Rules

- Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.
- Sections: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Include `Migration Notes` if users need to take action (or state "No action required").
- Breaking changes go under `Changed` or `Removed` with a `**BREAKING:**` prefix.
- Add a comparison link at the bottom of the file for each version.

### Release Process

1. Update `CHANGELOG.md` with the new version entry.
2. Bump `version` in `package.json`.
3. Run `npm run build` to regenerate `dist/`.
4. Commit: `release: prepare <version>`.
5. Tag: `git tag v<version>`.
6. Push: `git push && git push --tags`.
7. GitHub Actions publishes to npm automatically on tag push.

### Versioning (SemVer)

- **Major** (`x.0.0`): Breaking API changes, removed tools, incompatible config changes.
- **Minor** (`0.x.0`): New features, new tools, backward-compatible additions.
- **Patch** (`0.0.x`): Bug fixes, doc corrections, dependency updates.

## Cursor/Copilot Rules

- None found in `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`.

## Common Pitfalls

- Don’t import `.ts` paths at runtime; use `.js` extension.
- Avoid using Node SQLite APIs; this plugin relies on `bun:sqlite`.
- Ensure tools work without a session store when `enableSessionStore` is false.

## Updating This File

Update AGENTS.md when:
- New scripts are added to `package.json`
- Tests are added or a runner changes
- Tooling/linting rules change
