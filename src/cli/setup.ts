#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CONFIG_PATH = path.join(
  os.homedir(),
  '.config',
  'opencode',
  'discord_opencode.json',
);

const DEFAULT_CONFIG = {
  discordToken: '',
  defaultChannelId: '',
  databasePath: '~/.discord_opencode/sessions.db',
  allowedFilePaths: ['~/projects', '/tmp'],
  maxFileSize: 8388608,
  projectsDirectory: '~/projects',
  allowedCommands: [
    'npm test',
    'npm run build',
    'npm run lint',
    'npm install',
    'git status',
  ],
  enableSessionStore: true,
  enableProjectCommands: true,
  requireRemoteApproval: true,
};

const printUsage = (): void => {
  console.log(
    'Usage: npx @thesammykins/discord_opencode setup [--config PATH] [--force]',
  );
};

const normalizeHomePath = (value: string): string => {
  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
};

const parseArgs = (args: string[]): {
  configPath: string;
  force: boolean;
} | null => {
  if (args.length === 0 || args[0] !== 'setup') {
    return null;
  }

  let force = false;
  let configPath = DEFAULT_CONFIG_PATH;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--config') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('Missing value for --config');
      }

      configPath = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    configPath,
    force,
  };
};

const run = (): void => {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed) {
    printUsage();
    return;
  }

  const resolvedPath = path.resolve(normalizeHomePath(parsed.configPath));

  if (existsSync(resolvedPath) && !parsed.force) {
    console.log(
      `Config already exists at ${resolvedPath}. Use --force to overwrite.`,
    );
    return;
  }

  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(
    resolvedPath,
    `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
    'utf8',
  );

  console.log(`Config written to ${resolvedPath}.`);
  console.log(
    'Next steps: add your Discord token and channel ID, then start OpenCode.',
  );
};

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Setup failed: ${message}`);
  process.exit(1);
}
