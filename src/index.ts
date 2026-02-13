import { loadConfig } from './config.js';
import { ensureSchema } from './schema.js';
import { resolveAllowedTools } from './tools/allowlist.js';
import { buildTools } from './tools/index.js';

export default async () => {
  const config = loadConfig();

  if (config.enableSessionStore && config.databasePath) {
    ensureSchema(config.databasePath);
  }

  const allowedTools = resolveAllowedTools(config);
  const tools = buildTools(config, allowedTools);

  return {
    tool: tools,
  };
};
