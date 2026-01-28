import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginConfig } from '../config.js';

const ALLOWED_TOOLS_HEADER = '## Allowed Tools';

export function resolveAllowedTools(config: PluginConfig): Set<string> {
  if (config.allowedTools && config.allowedTools.length > 0) {
    return new Set(config.allowedTools);
  }

  const agentsPath = join(process.cwd(), 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    console.warn('[discord-opencode] AGENTS.md not found; no allowed tools configured.');
    return new Set();
  }

  const contents = readFileSync(agentsPath, 'utf8');
  const headerIndex = contents.indexOf(ALLOWED_TOOLS_HEADER);
  if (headerIndex === -1) {
    console.warn('[discord-opencode] Allowed Tools section missing in AGENTS.md.');
    return new Set();
  }

  const section = contents.slice(headerIndex);
  const lines = section.split('\n').slice(1);
  const tools: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) break;
    const match = line.match(/`([a-z0-9_]+)`/i);
    if (match?.[1]) tools.push(match[1]);
  }

  return new Set(tools);
}
