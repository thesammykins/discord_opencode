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
- Test (current): `npm test`
  - Note: currently prints "No tests yet" and exits 0.
- Lint: none configured

### Single Test

- Not available yet (no test runner or tests).
- When tests are added, update `package.json` and this file.

## Repository Layout

- `src/index.ts`: Tool definitions and main plugin entry
- `src/config.ts`: Environment-based configuration
- `src/validation.ts`: Discord limit validation helpers
- `src/file-sandbox.ts`: File access security
- `src/types/bun.d.ts`: Types for `bun:sqlite`
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
