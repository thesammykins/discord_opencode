# Discord OpenCode Plugin

A Discord tools plugin for OpenCode that enables AI agents to send messages, embeds, buttons, and manage Discord interactions directly from the OpenCode CLI.

## Features

- **Send messages** to Discord channels and threads
- **Rich embeds** with colors, fields, and timestamps
- **Interactive buttons** with user input handling
- **File uploads** with security sandboxing
- **Thread management** (create, rename, get history)
- **Human-in-the-loop** (request input, approval)
- **System status** monitoring
- **Discord health** checks
- **Project commands** (list projects, run commands)

## Installation

Install as a project dependency:

```bash
npm install @thesammykins/discord_opencode
```

Or install globally for the setup CLI:

```bash
npm install -g @thesammykins/discord_opencode
```

## Prerequisites

1. **Discord Bot Token**: Create a Discord bot at https://discord.com/developers/applications
2. **Bun Runtime**: This plugin requires Bun (not Node.js) for SQLite support
3. **OpenCode**: Install from https://opencode.ai

## Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
5. Copy your bot token (you'll need this for the `DISCORD_TOKEN` env var)
6. Go to "OAuth2" > "URL Generator"
   - Select scopes: `bot`, `applications.commands`
   - Select bot permissions:
     - Send Messages
     - Read Messages/View Channels
     - Embed Links
     - Attach Files
     - Read Message History
     - Add Reactions
     - Use Slash Commands
     - Create Public Threads
     - Send Messages in Threads
7. Copy the generated URL and open it in your browser to invite the bot to your server

## Configuration

### Quick Setup

Generate a config template with the setup CLI:

```bash
npx @thesammykins/discord_opencode setup
```

Options:
- `--force` — overwrite an existing config file
- `--config PATH` — write config to a custom path

This creates a config at `~/.config/opencode/discord_opencode.json` with defaults you can edit.

### Config File

On first run, the plugin creates a template config file at:

`~/.config/opencode/discord_opencode.json`

Edit that file and add your Discord token. If the file is missing, the plugin will create it and return an error telling you to restart OpenCode after setup.

Example config:

```json
{
  "discordToken": "YOUR_DISCORD_TOKEN",
  "defaultChannelId": "123456789",
  "databasePath": "/home/user/.discord_opencode/sessions.db",
  "allowedFilePaths": ["/home/user/projects", "/tmp"],
  "maxFileSize": 8388608,
  "projectsDirectory": "/home/user/projects",
  "allowedCommands": ["npm test", "npm run build", "npm run lint", "npm install", "git status"],
  "enableSessionStore": true,
  "enableProjectCommands": true,
  "requireRemoteApproval": true,
  "allowedTools": ["send_discord_message", "send_embed"]
}
```

Notes:
- `allowedCommands` is the allowlist for `run_project_command`.
- `projectsDirectory` is the root used by `list_projects` and `run_project_command`.

Environment variables still override file values when needed:

```bash
export DISCORD_TOKEN="your-discord-bot-token"
export DISCORD_OPENCODE_CONFIG_PATH="/custom/path/discord_opencode.json"
```

## OpenCode Configuration

Add the plugin to your `opencode.json`:

```json
{
  "plugin": [
    "@thesammykins/discord_opencode"
  ]
}
```

## Available Tools

### Messaging

- `send_discord_message` - Send text messages (auto-chunked if >1900 chars)
- `edit_message` - Edit existing messages
- `delete_message` - Delete messages
- `reply_to_message` - Reply to specific messages
- `start_typing` - Show typing indicator

### Embeds & UI

- `send_embed` - Rich embeds with title, description, fields, colors, images
- `send_buttons` - Interactive buttons for user choices
- `await_button_click` - Wait for button interaction
- `update_status` - Update message with status indicators
- `add_reaction` - Add emoji reactions

### Threads

- `create_thread_for_conversation` - Create new threads
- `rename_thread` - Rename existing threads
- `get_thread_history` - Get message history
- `get_session_context` - Get full thread context

### Human Interaction

- `request_human_input` - Ask questions and wait for response
- `request_approval` - Get yes/no approval before actions
- `notify_human` - Send notifications
- `approve_remote_session` - Allow a session to send Discord messages

### System & Projects

- `get_system_status` - Get server metrics (uptime, disk, memory, CPU)
- `get_discord_health` - Check Discord client connection status
- `list_projects` - List projects in projects directory
- `run_project_command` - Run allowlisted commands in project directories

## Session Store (Optional)

The plugin can track Discord threads and OpenCode sessions in a SQLite database. This enables:

- Automatic channel resolution from session context
- Thread persistence across tool calls

### Automatic Schema Bootstrap

When `enableSessionStore` is true (the default), the plugin automatically creates the database file, `sessions` table, indexes, and enables WAL mode on first run. No manual SQL is required.

The schema is idempotent — running against an existing database is a no-op. Existing databases are also migrated automatically (e.g., adding the `remote_allowed` column if missing).

**Database location:** `~/.discord_opencode/sessions.db` (default), configurable via `databasePath` in config or `DISCORD_OPENCODE_DB_PATH` env var.

**Troubleshooting:** If the plugin reports a database error, ensure the parent directory is writable. For existing installs, consider backing up your database before upgrading.

### Schema Reference

The `sessions` table is created with the following columns:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  discord_thread_id TEXT,
  discord_channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle',
  agent_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  opencode_session_id TEXT,
  project_path TEXT,
  project_name TEXT,
  context_encrypted TEXT,
  context_iv TEXT,
  context_tag TEXT,
  remote_allowed INTEGER NOT NULL DEFAULT 0
);
```

## File Upload Security

File uploads are sandboxed to prevent unauthorized access:

- Only files within allowed directories can be uploaded
- Maximum file size is enforced (default: 8MB)
- Files with multiple hardlinks are rejected
- Symlinks are resolved to their real paths

## Project Commands

When enabled, the plugin can:

- List all projects in your projects directory
- Run allowlisted commands (npm test, npm run build, npm run lint, npm install, git status)

Commands are sandboxed to the project directory.

## Usage Examples

### Send a Message

```
AI: I'll send a message to the Discord channel.
[Uses send_discord_message]
```

### Send an Embed

```
AI: Let me send a rich embed with information.
[Uses send_embed with title, description, fields, color]
```

### Create a Thread

```
AI: I'll create a thread for this discussion.
[Uses create_thread_for_conversation]
```

### Request Approval

```
AI: Before I delete this file, I need your approval.
[Uses request_approval]
```

## Memory Management (Optional)

The plugin does not include a memory backend, but you can add persistent memory using [Chroma MCP](https://github.com/chroma-core/chroma-mcp) or similar tools. Memory is entirely optional and outside the plugin's core behavior.

### Chroma MCP Setup

Add Chroma as an MCP server in your OpenCode config:

```json
{
  "mcpServers": {
    "chroma": {
      "command": "uvx",
      "args": ["chroma-mcp", "--client-type", "persistent", "--data-dir", "/path/to/data"]
    }
  }
}
```

Set `DEVBOI_DATA_DIR` to control where Chroma stores its data.

### Retention Policy

- **Store:** Decisions, architecture rationale, discovered constraints, user preferences
- **Skip:** Ephemeral chat, raw logs, sensitive data (tokens, passwords)
- Memory entries should explain *why*, not just *what*

## Development

```bash
# Clone the repository
git clone https://github.com/thesammykins/discord_opencode.git
cd discord_opencode

# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Test
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- GitHub Issues: https://github.com/thesammykins/discord_opencode/issues
- OpenCode: https://opencode.ai
