# Open Source Discord Tools Plugin - Plan

## Overview

Extract the Discord tools plugin from devboi_bot into a standalone, open-source package that can be used by any OpenCode project.

## Current State Analysis

### Plugin Location
- **Current**: `.opencode/plugin/discord-tools.js` (874 lines)
- **Registration**: `file:///home/sammy/projects/devboi_bot/.opencode/plugin/discord-tools.js` in `opencode.json`

### Dependencies
- `@opencode-ai/plugin` - Plugin SDK
- `discord.js` - Discord API client
- `bun:sqlite` - SQLite access (Bun built-in)

### Coupling Issues

1. **Source Code Imports** (Tight Coupling)
   - `../../src/utils/validation.ts` - Discord limits & validators
   - `../../src/utils/file-sandbox.ts` - File access security
   - These are TypeScript files imported from JavaScript at runtime

2. **Shared Database**
   - Plugin reads from `$DEVBOI_DATA_DIR/sessions.db` directly
   - Hardcoded SQL queries expecting specific schema
   - Main bot uses `better-sqlite3`, plugin uses `bun:sqlite`

3. **Hardcoded Paths**
   - `~/projects` for `list_projects` and `run_project_command`
   - `~/.devboi/sessions.db` fallback for database

4. **Dual Discord Clients**
   - Main bot has persistent Discord client (Node.js)
   - Plugin spawns temporary clients per tool call (Bun)

## Target Architecture

### New Package: `discord_opencode`

**Location:** `~/projects/discord_opencode/`

```
discord_opencode/
├── package.json
├── README.md
├── LICENSE
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── config.ts             # Configuration management
│   ├── validation.ts         # Discord limits (extracted from devboi_bot)
│   ├── file-sandbox.ts       # File security (extracted from devboi_bot)
│   ├── discord-client.ts     # Discord client management
│   ├── session-store.ts      # Session database interface
│   └── tools/
│       ├── messaging.ts      # send_discord_message, edit_message, etc.
│       ├── embeds.ts         # send_embed
│       ├── buttons.ts        # send_buttons, await_button_click
│       ├── threads.ts        # create_thread, rename_thread, get_thread_history
│       ├── files.ts          # send_file
│       ├── reactions.ts      # add_reaction
│       ├── interactions.ts   # request_human_input, request_approval
│       ├── system.ts         # get_system_status
│       └── projects.ts       # list_projects, run_project_command
├── dist/                     # Compiled output
└── tests/
    └── *.test.ts
```

## Migration Steps

### Phase 1: Extract Shared Utilities

**Files to Extract:**
1. `src/utils/validation.ts` → `discord_opencode/src/validation.ts`
2. `src/utils/file-sandbox.ts` → `discord_opencode/src/file-sandbox.ts`

**Changes Needed:**
- Convert to JavaScript (remove TypeScript-specific syntax for runtime compatibility)
- Make paths configurable via environment variables
- Remove hardcoded `~/projects` and `/tmp` defaults

### Phase 2: Create Configuration System

**New `src/config.ts`:**
```typescript
export interface PluginConfig {
  // Discord
  discordToken: string;
  
  // Database
  databasePath: string;
  
  // File Sandbox
  allowedFilePaths: string[];
  maxFileSize: number;
  
  // Projects
  projectsDirectory: string;
  allowedCommands: string[];
  
  // Features
  enableSessionStore: boolean;
  enableProjectCommands: boolean;
}

export function loadConfig(): PluginConfig {
  return {
    discordToken: process.env.DISCORD_TOKEN || '',
    databasePath: process.env.DISCORD_OPENCODE_DB_PATH || 
      join(homedir(), '.discord_opencode', 'sessions.db'),
    allowedFilePaths: process.env.DISCORD_OPENCODE_ALLOWED_PATHS?.split(',') || [
      join(homedir(), 'projects'),
      '/tmp'
    ],
    maxFileSize: parseInt(process.env.DISCORD_OPENCODE_MAX_FILE_SIZE || '8388608'),
    projectsDirectory: process.env.DISCORD_OPENCODE_PROJECTS_DIR || 
      join(homedir(), 'projects'),
    allowedCommands: ['npm test', 'npm run build', 'npm run lint', 'npm install', 'git status'],
    enableSessionStore: process.env.DISCORD_OPENCODE_ENABLE_SESSIONS !== 'false',
    enableProjectCommands: process.env.DISCORD_OPENCODE_ENABLE_PROJECTS !== 'false',
  };
}
```

### Phase 3: Refactor Discord Tools

**Key Changes:**

1. **Remove relative imports from devboi_bot**
   - Replace `../../src/utils/validation.ts` with local `./validation.js`
   - Replace `../../src/utils/file-sandbox.ts` with local `./file-sandbox.js`

2. **Make session store optional**
   - If `enableSessionStore: false`, skip session lookups
   - Tools should work without database (require explicit channel_id)

3. **Make project commands optional**
   - If `enableProjectCommands: false`, don't register those tools
   - Or return error: "Project commands not enabled"

4. **Discord Client Management**
   - Keep singleton pattern for efficiency
   - Add proper cleanup/error handling

### Phase 4: Package Structure

**package.json:**
```json
{
  "name": "discord_opencode",
  "version": "1.0.0",
  "description": "Discord tools plugin for OpenCode",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/"],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.1.36",
    "discord.js": "^14.16"
  },
  "peerDependencies": {
    "bun": ">=1.0"
  },
  "engines": {
    "bun": ">=1.0"
  },
  "keywords": ["opencode", "plugin", "discord", "ai"],
  "license": "MIT"
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Phase 5: Update devboi_bot

**Changes to devboi_bot:**

1. **Remove plugin from repository**
   - Delete `.opencode/plugin/discord-tools.js`
   - Delete `.opencode/plugin/` directory

2. **Install as npm package**
   ```bash
   npm install discord_opencode
   ```

3. **Update opencode.json**
   ```json
   {
     "plugin": [
       "discord_opencode"
     ]
   }
   ```

4. **Keep shared utilities in src/utils/**
   - Main bot still needs `validation.ts` and `file-sandbox.ts`
   - These are used by bot commands, not just plugin
   - Consider making them a shared package later

5. **Environment Variables**
   ```bash
   # Add to .env
   DISCORD_OPENCODE_DB_PATH=/home/sammy/.devboi/sessions.db
   DISCORD_OPENCODE_ALLOWED_PATHS=/home/sammy/projects,/tmp
   DISCORD_OPENCODE_PROJECTS_DIR=/home/sammy/projects
   ```

## Open Source Considerations

### Repository Setup

1. **Create new repository:** `github.com/thesammykins/discord_opencode`
2. **License:** MIT (same as devboi_bot)
3. **README.md** with:
   - Installation instructions
   - Configuration options
   - Available tools reference
   - Example usage
   - Contributing guidelines

### Documentation

**README.md sections:**
- Overview
- Installation (npm/yarn/pnpm)
- Configuration (env vars)
- Available Tools (19 tools listed with descriptions)
- Session Store (optional feature)
- Project Commands (optional feature)
- Security (file sandbox explanation)
- Development (building, testing)
- License

### Publishing

1. **npm registry**
   - `npm publish --access public`

2. **GitHub Releases**
   - Automated with GitHub Actions
   - Tag-based versioning

3. **Versioning**
   - Follow semver
   - Initial: 1.0.0

## Files to Create/Modify

### New Package (discord_opencode)

**Location:** `~/projects/discord_opencode/`

**New files:**
- `package.json`
- `tsconfig.json`
- `README.md`
- `LICENSE`
- `src/index.ts` (refactored from discord-tools.js)
- `src/config.ts` (new)
- `src/validation.ts` (extracted from devboi_bot)
- `src/file-sandbox.ts` (extracted from devboi_bot)
- `src/discord-client.ts` (new)
- `src/session-store.ts` (new)
- `src/tools/*.ts` (split from discord-tools.js)

### devboi_bot Changes

**Files to modify:**
- `opencode.json` - Update plugin reference
- `package.json` - Add dependency
- `.env` - Add plugin configuration

**Files to delete:**
- `.opencode/plugin/discord-tools.js`
- `.opencode/plugin/` (if empty)

**Files to keep (still used by bot):**
- `src/utils/validation.ts`
- `src/utils/file-sandbox.ts`

## Verification

### Testing Checklist

- [ ] Plugin loads without errors
- [ ] All 19 tools are registered
- [ ] Discord messages send correctly
- [ ] Embeds render properly
- [ ] Buttons work with await_button_click
- [ ] File uploads respect sandbox limits
- [ ] Session store lookups work (if enabled)
- [ ] Project commands work (if enabled)
- [ ] Configuration via env vars works
- [ ] Works without session store (explicit channel_id)

### Migration Verification

- [ ] devboi_bot starts successfully
- [ ] All existing commands work
- [ ] AI can still send Discord messages
- [ ] Thread creation works
- [ ] Session persistence works
- [ ] No regression in functionality

## Timeline Estimate

- **Phase 1** (Extract utilities): 2-3 hours
- **Phase 2** (Config system): 1-2 hours
- **Phase 3** (Refactor tools): 4-6 hours
- **Phase 4** (Package structure): 1-2 hours
- **Phase 5** (Update devboi_bot): 1-2 hours
- **Documentation**: 2-3 hours
- **Testing**: 2-3 hours

**Total: 13-19 hours**

## Benefits

1. **Reusability** - Other OpenCode projects can use Discord integration
2. **Maintainability** - Separate versioning and release cycle
3. **Community** - Others can contribute improvements
4. **Clean Architecture** - Clear separation of concerns
5. **Documentation** - Forces better documentation

## Risks

1. **Breaking Changes** - Need careful migration
2. **Dual Maintenance** - Shared utilities exist in two places temporarily
3. **Runtime Differences** - Bun vs Node.js compatibility
4. **Configuration Complexity** - More env vars to manage

## Important Constraint

**Do NOT write any code into the current devboi_bot directory.** All new plugin code goes into `~/projects/discord_opencode/`. The migration of devboi_bot to use the new plugin will happen AFTER the plugin is working and published.

## Current Status (2025-01-27)

### Completed

1. ✅ Project created at `~/projects/discord_opencode/`
2. ✅ Git repository initialized
3. ✅ GitHub repo created: https://github.com/thesammykins/discord_opencode
4. ✅ Package.json with `@thesammykins/discord_opencode` name
5. ✅ TypeScript configuration (tsconfig.json)
6. ✅ Source files created:
   - `src/validation.ts` - Discord limits and validators
   - `src/file-sandbox.ts` - File access security
   - `src/config.ts` - Environment-based configuration
   - `src/index.ts` - Main plugin with all 19 tools
   - `src/types/bun.d.ts` - Type declarations for bun:sqlite
7. ✅ Documentation (README.md with bot setup instructions)
8. ✅ LICENSE (MIT)
9. ✅ .gitignore and .npmignore files
10. ✅ Dependencies installed (@opencode-ai/plugin, discord.js, @types/node, typescript)

### Remaining Tasks

1. **Fix TypeScript Build Errors**
   - bun:sqlite module type declarations (created src/types/bun.d.ts but needs verification)
   - Discord.js channel type casting issues (Property 'send' does not exist on union types)
   - ToolContext type issues (Property 'session' and 'userId' don't exist)
   
2. **Build the Project**
   - Run `npm run build` successfully
   - Verify dist/ directory is created with compiled JS and type declarations
   
3. **Commit and Push**
   - Add .gitignore and .npmignore to git
   - Commit remaining changes
   - Push to GitHub (previous push had timeout error but said "Everything up-to-date")
   
4. **Publish to npm**
   - Verify npm login
   - Run `npm publish --access public`
   - Verify package is available at https://www.npmjs.com/package/@thesammykins/discord_opencode

### TypeScript Errors to Fix

```
src/index.ts(91,37): error TS2307: Cannot find module 'bun:sqlite'
src/index.ts(168,37): error TS2339: Property 'send' does not exist on type...
src/index.ts(354,42): error TS2551: Property 'session' does not exist on type 'ToolContext'
```

**Solutions needed:**
- Add proper type casting for Discord channels (use `as TextChannel` or similar)
- Fix ToolContext type to include session and userId properties
- Verify bun:sqlite type declaration is being picked up

### Next Steps (Priority Order)

1. Fix TypeScript errors in src/index.ts
2. Build successfully
3. Commit .gitignore and .npmignore
4. Push to GitHub
5. Publish to npm
6. Test installation in a fresh project

### Phase 2: Migration (AFTER plugin is working)

**Note: This phase happens AFTER the plugin is published and working.**

1. Install `@thesammykins/discord_opencode` in devboi_bot
2. Update opencode.json to use new package
3. Add environment variables to .env
4. Test devboi_bot with new plugin
5. Delete `.opencode/plugin/discord-tools.js`
6. Verify all functionality works
7. Commit changes
