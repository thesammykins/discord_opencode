import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import { DISCORD_LIMITS, validateContentLength } from '../validation.js';
import { resolveChannelId, splitMessageContent, getChannel, type ToolContext } from './discord.js';
import { withUserConfirmation } from './wrappers.js';

export function buildMessageTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    send_discord_message: withUserConfirmation('send_discord_message', allowedTools, {
      description: 'Send a message to Discord. Channel is auto-detected from session context.',
      args: {
        content: tool.schema.string().describe('Message content'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { content, channel_id } = args as { content: string; channel_id?: string };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const chunks = splitMessageContent(content);
        const messageIds: string[] = [];
        for (const chunk of chunks) {
          const msg = await channel.send(chunk);
          messageIds.push(msg.id);
        }
        return chunks.length === 1
          ? `Message sent: ${messageIds[0]}`
          : `${chunks.length} messages sent: ${messageIds.join(', ')}`;
      },
    }),

    update_status: withUserConfirmation('update_status', allowedTools, {
      description: 'Update a message with a status indicator',
      args: {
        message_id: tool.schema.string().describe('Message ID to update'),
        state: tool.schema
          .enum(['processing', 'thinking', 'searching', 'writing', 'done', 'error', 'waiting'])
          .describe('Status state preset'),
        custom: tool.schema
          .string()
          .optional()
          .describe('Custom status text (overrides preset)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context) {
        const { message_id, state, channel_id, custom } = args as {
          message_id: string;
          state: string;
          channel_id?: string;
          custom?: string;
        };
        const STATE_PRESETS: Record<string, string> = {
          processing: '🤖 Processing...',
          thinking: '🧠 Thinking...',
          searching: '🔍 Searching...',
          writing: '✍️ Writing...',
          done: '✅ Done',
          error: '❌ Something went wrong',
          waiting: '⏳ Waiting for input...',
        };

        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const message = await channel.messages.fetch(message_id);
        const statusText = custom || STATE_PRESETS[state] || STATE_PRESETS.processing;
        await message.edit(statusText);
        return `Status updated to: ${state}`;
      },
    }),

    start_typing: withUserConfirmation('start_typing', allowedTools, {
      description: 'Show typing indicator (lasts ~10 seconds)',
      args: {
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context) {
        const { channel_id } = args as { channel_id?: string };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        await channel.sendTyping();
        return 'Typing indicator started';
      },
    }),

    reply_to_message: withUserConfirmation('reply_to_message', allowedTools, {
      description: 'Reply to a specific message (shows reply preview)',
      args: {
        message_id: tool.schema.string().describe('Message ID to reply to'),
        content: tool.schema.string().describe('Reply content (max 2000 chars)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context) {
        const { message_id, content, channel_id } = args as {
          message_id: string;
          content: string;
          channel_id?: string;
        };
        const contentError = validateContentLength(
          content,
          DISCORD_LIMITS.messageContent,
          'Content'
        );
        if (contentError) return contentError;

        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const target = await channel.messages.fetch(message_id);
        const msg = await target.reply(content.slice(0, DISCORD_LIMITS.messageContent));
        return `Reply sent: ${msg.id}`;
      },
    }),

    edit_message: withUserConfirmation('edit_message', allowedTools, {
      description: 'Edit an existing Discord message',
      args: {
        message_id: tool.schema.string().describe('Message ID to edit'),
        content: tool.schema.string().describe('New message content (max 2000 chars)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context) {
        const { message_id, content, channel_id } = args as {
          message_id: string;
          content: string;
          channel_id?: string;
        };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const message = await channel.messages.fetch(message_id);
        await message.edit(content.slice(0, DISCORD_LIMITS.messageContent));
        return `Message edited: ${message.id}`;
      },
    }),

    delete_message: withUserConfirmation('delete_message', allowedTools, {
      description: 'Delete a Discord message',
      args: {
        message_id: tool.schema.string().describe('Message ID to delete'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context) {
        const { message_id, channel_id } = args as { message_id: string; channel_id?: string };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const message = await channel.messages.fetch(message_id);
        await message.delete();
        return `Message deleted: ${message_id}`;
      },
    }),

    add_reaction: withUserConfirmation('add_reaction', allowedTools, {
      description: 'Add an emoji reaction to a message',
      args: {
        message_id: tool.schema.string().describe('Message ID to react to'),
        emoji: tool.schema.string().describe('Emoji to add'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context) {
        const { message_id, emoji, channel_id } = args as {
          message_id: string;
          emoji: string;
          channel_id?: string;
        };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const message = await channel.messages.fetch(message_id);
        await message.react(emoji);
        return `Reaction ${emoji} added`;
      },
    }),
  };
}
