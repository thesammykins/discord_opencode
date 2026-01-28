import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface PluginConfig {
  // Discord
  discordToken: string;
  defaultChannelId?: string;

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
  requireRemoteApproval: boolean;

  // Tool access
  allowedTools?: string[];
}

interface PluginConfigFile {
  discordToken?: string;
  defaultChannelId?: string;
  databasePath?: string;
  allowedFilePaths?: string[];
  maxFileSize?: number;
  projectsDirectory?: string;
  allowedCommands?: string[];
  enableSessionStore?: boolean;
  enableProjectCommands?: boolean;
  requireRemoteApproval?: boolean;
  allowedTools?: string[];
}

const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'opencode', 'discord_opencode.json');

function buildDefaultConfig(): PluginConfig {
  return {
    discordToken: '',
    defaultChannelId: undefined,
    databasePath: join(homedir(), '.discord_opencode', 'sessions.db'),
    allowedFilePaths: [join(homedir(), 'projects'), '/tmp'],
    maxFileSize: 8_388_608,
    projectsDirectory: join(homedir(), 'projects'),
    allowedCommands: ['npm test', 'npm run build', 'npm run lint', 'npm install', 'git status'],
    enableSessionStore: true,
    enableProjectCommands: true,
    requireRemoteApproval: true,
    allowedTools: undefined,
  };
}

function writeTemplateConfig(configPath: string, defaults: PluginConfig) {
  const targetDir = dirname(configPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  const template: PluginConfigFile = {
    discordToken: '',
    defaultChannelId: defaults.defaultChannelId,
    databasePath: defaults.databasePath,
    allowedFilePaths: defaults.allowedFilePaths,
    maxFileSize: defaults.maxFileSize,
    projectsDirectory: defaults.projectsDirectory,
    allowedCommands: defaults.allowedCommands,
    enableSessionStore: defaults.enableSessionStore,
    enableProjectCommands: defaults.enableProjectCommands,
    requireRemoteApproval: defaults.requireRemoteApproval,
    allowedTools: defaults.allowedTools,
  };

  writeFileSync(configPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
}

function loadConfigFile(configPath: string, defaults: PluginConfig): PluginConfigFile {
  if (!existsSync(configPath)) {
    writeTemplateConfig(configPath, defaults);
    throw new Error(
      `discord_opencode config not found. A template was created at ${configPath}. ` +
        'Edit it with your Discord token and restart OpenCode.'
    );
  }

  const raw = readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(raw) as PluginConfigFile;
  } catch (error) {
    throw new Error(
      `Failed to parse discord_opencode config at ${configPath}. Ensure it is valid JSON.`
    );
  }
}

export function loadConfig(): PluginConfig {
  const defaults = buildDefaultConfig();
  const configPath = process.env.DISCORD_OPENCODE_CONFIG_PATH || DEFAULT_CONFIG_PATH;
  const fileConfig = loadConfigFile(configPath, defaults);

  return {
    discordToken: process.env.DISCORD_TOKEN || fileConfig.discordToken || defaults.discordToken,
    defaultChannelId:
      process.env.DISCORD_OPENCODE_DEFAULT_CHANNEL_ID ||
      fileConfig.defaultChannelId ||
      defaults.defaultChannelId,
    databasePath:
      process.env.DISCORD_OPENCODE_DB_PATH || fileConfig.databasePath || defaults.databasePath,
    allowedFilePaths:
      process.env.DISCORD_OPENCODE_ALLOWED_PATHS?.split(',') ||
      fileConfig.allowedFilePaths ||
      defaults.allowedFilePaths,
    maxFileSize:
      Number.parseInt(process.env.DISCORD_OPENCODE_MAX_FILE_SIZE || '') ||
      fileConfig.maxFileSize ||
      defaults.maxFileSize,
    projectsDirectory:
      process.env.DISCORD_OPENCODE_PROJECTS_DIR ||
      fileConfig.projectsDirectory ||
      defaults.projectsDirectory,
    allowedCommands: fileConfig.allowedCommands || defaults.allowedCommands,
    enableSessionStore:
      process.env.DISCORD_OPENCODE_ENABLE_SESSIONS
        ? process.env.DISCORD_OPENCODE_ENABLE_SESSIONS !== 'false'
        : fileConfig.enableSessionStore ?? defaults.enableSessionStore,
    enableProjectCommands:
      process.env.DISCORD_OPENCODE_ENABLE_PROJECTS
        ? process.env.DISCORD_OPENCODE_ENABLE_PROJECTS !== 'false'
        : fileConfig.enableProjectCommands ?? defaults.enableProjectCommands,
    requireRemoteApproval:
      process.env.DISCORD_OPENCODE_REQUIRE_REMOTE_APPROVAL
        ? process.env.DISCORD_OPENCODE_REQUIRE_REMOTE_APPROVAL !== 'false'
        : fileConfig.requireRemoteApproval ?? defaults.requireRemoteApproval,
    allowedTools:
      process.env.DISCORD_OPENCODE_ALLOWED_TOOLS?.split(',').map((t) => t.trim()) ||
      fileConfig.allowedTools ||
      defaults.allowedTools,
  };
}
