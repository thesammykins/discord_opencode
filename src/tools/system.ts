import { execSync } from 'node:child_process';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import { getClient } from './discord.js';
import { withUserConfirmation } from './wrappers.js';

export function buildSystemTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    get_system_status: withUserConfirmation('get_system_status', allowedTools, {
      description: 'Get server system metrics',
      args: {
        metric: tool.schema
          .enum(['uptime', 'disk', 'memory', 'cpu'])
          .describe('Which metric to retrieve'),
      },
      async execute(args: Record<string, unknown>) {
        const { metric } = args as { metric: string };
        const commands: Record<string, string> = {
          uptime: 'uptime -p',
          disk: 'df -h / | tail -1',
          memory: 'free -h | grep Mem',
          cpu: "top -bn1 | grep 'Cpu(s)' | head -1",
        };
        return execSync(commands[metric]).toString().trim();
      },
    }),

    get_discord_health: withUserConfirmation('get_discord_health', allowedTools, {
      description: 'Check Discord client connection status',
      args: {},
      async execute() {
        try {
          const client = await getClient(config);
          const ready = client.isReady();
          const user = client.user ? `${client.user.username}#${client.user.discriminator}` : null;
          return JSON.stringify({ status: ready ? 'ok' : 'not_ready', connected: ready, user });
        } catch (error) {
          console.error('[discord-opencode] Health check failed:', error);
          return JSON.stringify({ status: 'error', connected: false, user: null });
        }
      },
    }),
  };
}
