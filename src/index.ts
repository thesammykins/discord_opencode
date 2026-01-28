import { loadConfig } from './config.js';
import { resolveAllowedTools } from './tools/allowlist.js';
import { buildTools } from './tools/index.js';

export default async () => {
  const config = loadConfig();
  const allowedTools = resolveAllowedTools(config);
  const tools = buildTools(config, allowedTools);

  return {
    tool: tools,
  };
};
