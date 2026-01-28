import { ChannelType, ThreadChannel } from 'discord.js';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import { getChannel, resolveChannelId, registerThreadSession, type ToolContext } from './discord.js';
import { withUserConfirmation } from './wrappers.js';

export function buildThreadTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    create_thread_for_conversation: withUserConfirmation(
      'create_thread_for_conversation',
      allowedTools,
      {
        description:
          'Create a Discord thread for multi-step work, debugging, extended discussion, or context-dependent questions.',
        args: {
          channel_id: tool.schema.string().describe('Parent channel ID where thread will be created'),
          title: tool.schema
            .string()
            .describe('Thread title (max 100 chars, should summarize the topic)'),
          initial_message: tool.schema.string().describe('First message to send in the thread'),
          agent_type: tool.schema
            .enum(['ask', 'project'])
            .optional()
            .describe('Session type: ask (default) for discussions, project for coding work'),
        },
        async execute(args: Record<string, unknown>) {
          const { channel_id, title, initial_message, agent_type } = args as {
            channel_id: string;
            title: string;
            initial_message: string;
            agent_type?: 'ask' | 'project';
          };
          const channel = await getChannel(config, channel_id);

          if (channel.type !== ChannelType.GuildText) {
            return JSON.stringify({ error: 'Can only create threads in text channels' });
          }

          const thread = await channel.threads.create({
            name: title.slice(0, 100),
            autoArchiveDuration: 60,
          });

          await thread.send(initial_message);

          const sessionId = await registerThreadSession(config, thread, agent_type || 'ask');

          return JSON.stringify({
            thread_created: true,
            thread_id: thread.id,
            title: title.slice(0, 100),
            session_id: sessionId,
            session_registered: sessionId !== null,
          });
        },
      }
    ),

    rename_thread: withUserConfirmation('rename_thread', allowedTools, {
      description: 'Rename a Discord thread',
      args: {
        thread_id: tool.schema
          .string()
          .optional()
          .describe('Thread ID (auto-detected from session)'),
        name: tool.schema.string().describe('New thread name (max 100 chars)'),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { thread_id, name } = args as { thread_id?: string; name: string };
        const threadId = await resolveChannelId(config, thread_id, context, true, true);
        const thread = await getChannel(config, threadId.channelId);
        if (!thread.isThread()) {
          return 'Error: Not a thread';
        }
        const threadChannel = thread as ThreadChannel;
        await threadChannel.setName(name.slice(0, 100));
        return `Thread renamed to: ${name.slice(0, 100)}`;
      },
    }),

    get_thread_history: withUserConfirmation('get_thread_history', allowedTools, {
      description: 'Get recent messages from a thread for context',
      args: {
        thread_id: tool.schema
          .string()
          .optional()
          .describe('Discord thread ID (optional - auto-detected from session)'),
        limit: tool.schema
          .number()
          .optional()
          .describe('Number of messages (default: 20, max: 50)'),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { thread_id, limit } = args as { thread_id?: string; limit?: number };
        const threadId = await resolveChannelId(config, thread_id, context, false, true);
        const thread = await getChannel(config, threadId.channelId);
        if (!thread.isThread()) {
          return JSON.stringify({ error: 'Not a thread' });
        }
        const threadChannel = thread as ThreadChannel;
        const messages = await threadChannel.messages.fetch({ limit: Math.min(limit ?? 20, 50) });
        const history = [...messages.values()].reverse().map((message) => ({
          author: message.author.username,
          content: message.content,
          timestamp: message.createdTimestamp,
        }));
        return JSON.stringify(history);
      },
    }),

    get_session_context: withUserConfirmation('get_session_context', allowedTools, {
      description:
        'Get context about the current conversation/session including recent message history',
      args: {
        thread_id: tool.schema
          .string()
          .optional()
          .describe('Discord thread ID (optional - auto-detected from session)'),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { thread_id } = args as { thread_id?: string };
        const threadId = await resolveChannelId(config, thread_id, context, false, true);
        const thread = await getChannel(config, threadId.channelId);
        if (!thread.isThread()) {
          return JSON.stringify({ error: 'Not a thread' });
        }

        const threadChannel = thread as ThreadChannel;
        const messages = await threadChannel.messages.fetch({ limit: 30 });
        const history = [...messages.values()].reverse().map((message) => ({
          author: message.author.bot ? 'assistant' : 'user',
          username: message.author.username,
          content: message.content,
          timestamp: message.createdTimestamp,
        }));

        return JSON.stringify({
          thread_id: threadChannel.id,
          thread_name: threadChannel.name,
          created_at: threadChannel.createdTimestamp,
          message_count: messages.size,
          history,
        });
      },
    }),
  };
}
