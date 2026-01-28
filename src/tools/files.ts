import { basename } from 'node:path';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import { DISCORD_LIMITS, validateContentLength } from '../validation.js';
import { validateFileAccess } from '../file-sandbox.js';
import { getChannel, resolveChannelId, type ToolContext } from './discord.js';
import { withUserConfirmation } from './wrappers.js';

export function buildFileTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    send_file: withUserConfirmation('send_file', allowedTools, {
      description: 'Send a file attachment to Discord. Files must be in allowed directories.',
      args: {
        file_path: tool.schema.string().describe('Path to file'),
        message: tool.schema.string().optional().describe('Message to include (max 2000 chars)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { file_path, message, channel_id } = args as {
          file_path: string;
          message?: string;
          channel_id?: string;
        };
        if (message) {
          const messageError = validateContentLength(
            message,
            DISCORD_LIMITS.messageContent,
            'Message'
          );
          if (messageError) return messageError;
        }

        const { error, buffer, realPath } = validateFileAccess(
          file_path,
          config.allowedFilePaths,
          config.maxFileSize
        );
        if (error) return error;
        if (!buffer || !realPath) return 'Error: File validation failed';

        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);

        const msg = await channel.send({
          content: message || undefined,
          files: [
            {
              attachment: buffer,
              name: basename(realPath),
            },
          ],
        });

        return `File sent: ${msg.id}`;
      },
    }),
  };
}
