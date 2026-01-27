import { homedir } from 'node:os';
import { join } from 'node:path';

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
    databasePath:
      process.env.DISCORD_OPENCODE_DB_PATH || join(homedir(), '.discord_opencode', 'sessions.db'),
    allowedFilePaths: process.env.DISCORD_OPENCODE_ALLOWED_PATHS?.split(',') || [
      join(homedir(), 'projects'),
      '/tmp',
    ],
    maxFileSize: Number.parseInt(process.env.DISCORD_OPENCODE_MAX_FILE_SIZE || '8388608'),
    projectsDirectory: process.env.DISCORD_OPENCODE_PROJECTS_DIR || join(homedir(), 'projects'),
    allowedCommands: ['npm test', 'npm run build', 'npm run lint', 'npm install', 'git status'],
    enableSessionStore: process.env.DISCORD_OPENCODE_ENABLE_SESSIONS !== 'false',
    enableProjectCommands: process.env.DISCORD_OPENCODE_ENABLE_PROJECTS !== 'false',
  };
}
