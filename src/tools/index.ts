import type { PluginConfig } from '../config.js';
import { buildEmbedTools } from './embeds.js';
import { buildFileTools } from './files.js';
import { buildInteractiveTools } from './interactive.js';
import { buildMessageTools } from './messages.js';
import { buildProjectTools } from './projects.js';
import { buildSystemTools } from './system.js';
import { buildThreadTools } from './threads.js';

export function buildTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    ...buildMessageTools(config, allowedTools),
    ...buildEmbedTools(config, allowedTools),
    ...buildInteractiveTools(config, allowedTools),
    ...buildFileTools(config, allowedTools),
    ...buildThreadTools(config, allowedTools),
    ...buildSystemTools(config, allowedTools),
    ...(config.enableProjectCommands ? buildProjectTools(config, allowedTools) : {}),
  };
}
