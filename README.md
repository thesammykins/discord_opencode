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
- **Project commands** (list projects, run commands)

## Installation

```bash
npm install @thesammykins/discord_opencode
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

Set these environment variables before running OpenCode:

```bash
# Required
export DISCORD_TOKEN="your-discord-bot-token"

# Optional - Session Store
export DISCORD_OPENCODE_DB_PATH="/path/to/sessions.db"  # Default: ~/.discord_opencode/sessions.db
export DISCORD_OPENCODE_ENABLE_SESSIONS="true"          # Default: true

# Optional - File Sandbox
export DISCORD_OPENCODE_ALLOWED_PATHS="/home/user/projects,/tmp"  # Default: ~/projects,/tmp
export DISCORD_OPENCODE_MAX_FILE_SIZE="8388608"         # Default: 8MB

# Optional - Project Commands
export DISCORD_OPENCODE_PROJECTS_DIR="/home/user/projects"  # Default: ~/projects
export DISCORD_OPENCODE_ENABLE_PROJECTS="true"          # Default: true
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

- `send_embed` - Rich embeds with title, description, fields, colors
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

### System & Projects

- `get_system_status` - Get server metrics (uptime, disk, memory, CPU)
- `list_projects` - List projects in projects directory
- `run_project_command` - Run allowlisted commands in project directories

## Session Store (Optional)

The plugin can track Discord threads and OpenCode sessions in a SQLite database. This enables:

- Automatic channel resolution from session context
- Thread persistence across tool calls

To set up the database schema:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  discord_thread_id TEXT,
  discord_channel_id TEXT,
  user_id TEXT,
  state TEXT,
  agent_type TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  opencode_session_id TEXT,
  project_path TEXT,
  project_name TEXT,
  context_encrypted BLOB,
  context_iv BLOB,
  context_tag BLOB
);

CREATE INDEX idx_opencode_session ON sessions(opencode_session_id);
CREATE INDEX idx_discord_thread ON sessions(discord_thread_id);
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
