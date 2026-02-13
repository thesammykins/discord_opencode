# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-13

### Added

- **Automatic schema bootstrap** — The sessions SQLite database (table, indexes, WAL mode) is now created automatically on plugin init. No manual setup required.
- **Setup CLI** — `npx @thesammykins/discord_opencode setup` generates a config template at `~/.config/opencode/discord_opencode.json`. Supports `--force` (overwrite) and `--config PATH` (custom location).
- **Schema migration** — Existing databases are automatically migrated to add the `remote_allowed` column if missing. Safe, idempotent, runs on every startup.
- **Unit tests** — 9 tests covering schema creation, migration, idempotency, WAL mode, and index verification.
- **Memory management docs** — README section on optional Chroma MCP integration for persistent memory.
- `all()` method on `Statement` type in `bun.d.ts`.

### Changed

- **`discord.ts` refactored** — Removed 6 redundant items: 2 module-level flags (`sessionSchemaChecked`, `hasRemoteApprovalColumn`), 1 constant (`REMOTE_APPROVAL_COLUMN`), 2 functions (`checkSessionSchema()`, `ensureRemoteApprovalColumn()`), and the vestigial `writable` param from `openSessionDb()`. Session queries now always reference `remote_allowed` directly since the schema bootstrap guarantees the column exists.

### Migration Notes

- **No action required.** The schema is created and migrated automatically. Existing databases are upgraded in place on first startup after updating.
- If you previously created the sessions table manually, the bootstrap detects it and skips creation (idempotent).

## [1.1.1] - 2025-06-10

### Changed

- Prepare release with auto-bump workflow.

## [1.1.0] - 2025-06-10

### Added

- Configuration file support and tool allowlist documentation.
- E2E test suite with Bun CI setup.
- Modular tool architecture and config bootstrap.

## [1.0.0] - 2025-06-09

### Added

- Initial release. Discord integration plugin for OpenCode.
- Session store with SQLite (bun:sqlite).
- Thread management, embed, button, file, and reaction tools.
- File sandbox security and Discord limit validation.
- Trusted publishing via GitHub Actions.

[1.2.0]: https://github.com/thesammykins/discord_opencode/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/thesammykins/discord_opencode/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/thesammykins/discord_opencode/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/thesammykins/discord_opencode/releases/tag/v1.0.0
