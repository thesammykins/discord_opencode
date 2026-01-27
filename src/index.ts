import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { join } from 'node:path';
import { tool } from '@opencode-ai/plugin';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  EmbedBuilder,
  GatewayIntentBits,
} from 'discord.js';
import { loadConfig } from './config.js';
import { validateFileAccess } from './file-sandbox.js';
import {
  DISCORD_LIMITS,
  validateButtonPrompt,
  validateButtons,
  validateContentLength,
  validateEmbedLength,
  validateField,
} from './validation.js';

let discordClient: Client | null = null;
let sessionDb: any = null;

const CHUNK_LIMIT = 1900;

function splitMessageContent(text: string, maxLength = CHUNK_LIMIT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

async function getClient(): Promise<Client> {
  if (discordClient?.isReady()) return discordClient;

  const config = loadConfig();

  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await discordClient.login(config.discordToken);
  return discordClient;
}

async function getChannel(channelId: string) {
  const client = await getClient();
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    throw new Error(`Invalid channel: ${channelId}`);
  }
  return channel;
}

async function getSessionDb() {
  if (sessionDb) return sessionDb;

  const { Database } = await import('bun:sqlite');
  const config = loadConfig();

  sessionDb = new Database(config.databasePath, { readonly: true });
  return sessionDb;
}

async function getThreadIdFromSession(
  opencodeSessionId: string | undefined
): Promise<string | null> {
  if (!opencodeSessionId) return null;

  const config = loadConfig();
  if (!config.enableSessionStore) return null;

  try {
    const db = await getSessionDb();
    const row = db
      .prepare('SELECT discord_thread_id FROM sessions WHERE opencode_session_id = ?')
      .get(opencodeSessionId);
    return row?.discord_thread_id || null;
  } catch (error) {
    console.error('[discord-opencode] Failed to lookup session:', error);
    return null;
  }
}

async function resolveChannelId(
  explicitChannelId: string | undefined,
  context: any
): Promise<string> {
  const config = loadConfig();

  // PRIORITY 1: Always try session lookup first - trust database over AI
  if (config.enableSessionStore) {
    const sessionId = context?.sessionID;
    if (sessionId) {
      const threadId = await getThreadIdFromSession(sessionId);
      if (threadId) {
        if (explicitChannelId && explicitChannelId !== threadId) {
          console.log(
            `[discord-opencode] Ignoring AI channel_id ${explicitChannelId}, using session-resolved ${threadId}`
          );
        }
        return threadId;
      }
    }
  }

  // PRIORITY 2: Fall back to explicit arg only if session lookup fails
  if (explicitChannelId) return explicitChannelId;

  throw new Error(
    'Could not resolve channel from session or args. ' +
      'Ensure this is running in a session or provide channel_id.'
  );
}

export default async () => {
  const config = loadConfig();

  const tools: Record<string, any> = {
    send_discord_message: tool({
      description: 'Send a message to Discord. Channel is auto-detected from session context.',
      args: {
        content: tool.schema.string().describe('Message content'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const chunks = splitMessageContent(args.content);
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

    send_embed: tool({
      description: 'Send a rich embed message to Discord',
      args: {
        content: tool.schema
          .string()
          .optional()
          .describe('Plain text above embed (max 2000 chars)'),
        title: tool.schema.string().optional().describe('Embed title (max 256 chars)'),
        description: tool.schema.string().optional().describe('Embed body text (max 4096 chars)'),
        color: tool.schema
          .enum(['red', 'green', 'blue', 'yellow', 'purple', 'orange'])
          .optional()
          .describe('Preset color name'),
        fields: tool.schema
          .array(
            tool.schema.object({
              name: tool.schema.string(),
              value: tool.schema.string(),
              inline: tool.schema.boolean().optional(),
            })
          )
          .optional()
          .describe('Embed fields (max 25, name 256 chars, value 1024 chars)'),
        footer: tool.schema.string().optional().describe('Footer text (max 2048 chars)'),
        timestamp: tool.schema.boolean().optional().describe('Add current timestamp'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        if (args.content) {
          const contentError = validateContentLength(
            args.content,
            DISCORD_LIMITS.messageContent,
            'Content'
          );
          if (contentError) return contentError;
        }

        if (args.title && args.title.length > DISCORD_LIMITS.embedTitle) {
          return `Error: Title exceeds ${DISCORD_LIMITS.embedTitle} characters`;
        }
        if (args.description && args.description.length > DISCORD_LIMITS.embedDescription) {
          return `Error: Description exceeds ${DISCORD_LIMITS.embedDescription} characters`;
        }
        if (args.footer && args.footer.length > DISCORD_LIMITS.embedFooter) {
          return `Error: Footer exceeds ${DISCORD_LIMITS.embedFooter} characters`;
        }

        if (args.fields) {
          if (args.fields.length > DISCORD_LIMITS.embedFields) {
            return `Error: Maximum ${DISCORD_LIMITS.embedFields} fields allowed`;
          }
          for (const field of args.fields) {
            const fieldError = validateField(field);
            if (fieldError) return fieldError;
          }
        }

        const lengthError = validateEmbedLength({
          title: args.title,
          description: args.description,
          footer: args.footer,
          fields: args.fields,
        });
        if (lengthError) return lengthError;

        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);

        const COLORS: Record<string, number> = {
          red: 0xe74c3c,
          green: 0x2ecc71,
          blue: 0x3498db,
          yellow: 0xffff00,
          purple: 0x9b59b6,
          orange: 0xe67e22,
        };

        const embed = new EmbedBuilder();
        if (args.title) embed.setTitle(args.title.slice(0, DISCORD_LIMITS.embedTitle));
        if (args.description) {
          embed.setDescription(args.description.slice(0, DISCORD_LIMITS.embedDescription));
        }
        if (args.color) embed.setColor(COLORS[args.color]);
        if (args.fields) embed.addFields(args.fields.slice(0, DISCORD_LIMITS.embedFields));
        if (args.footer)
          embed.setFooter({ text: args.footer.slice(0, DISCORD_LIMITS.embedFooter) });
        if (args.timestamp) embed.setTimestamp();

        const msg = await channel.send({
          content: args.content?.slice(0, DISCORD_LIMITS.messageContent) || undefined,
          embeds: [embed],
        });
        return `Embed sent: ${msg.id}`;
      },
    }),

    send_buttons: tool({
      description: 'Send interactive buttons for user choices',
      args: {
        prompt: tool.schema.string().describe('Message text above buttons'),
        buttons: tool.schema
          .array(
            tool.schema.object({
              label: tool.schema.string().describe('Button text'),
              id: tool.schema.string().describe('Unique identifier (max 100 chars)'),
              style: tool.schema
                .enum(['primary', 'secondary', 'success', 'danger'])
                .optional()
                .describe('Button style (default: primary)'),
            })
          )
          .describe('Button definitions (max 5 per row)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const promptError = validateButtonPrompt(args.prompt);
        if (promptError) return promptError;

        const buttonsError = validateButtons(args.buttons);
        if (buttonsError) return buttonsError;

        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);

        const styleMap: Record<string, ButtonStyle> = {
          primary: ButtonStyle.Primary,
          secondary: ButtonStyle.Secondary,
          success: ButtonStyle.Success,
          danger: ButtonStyle.Danger,
        };

        const buttons = args.buttons
          .slice(0, DISCORD_LIMITS.buttonsPerRow)
          .map((b: { id: string; label: string; style?: string }) =>
            new ButtonBuilder()
              .setCustomId(b.id.slice(0, DISCORD_LIMITS.buttonCustomId))
              .setLabel(b.label.slice(0, DISCORD_LIMITS.buttonLabel))
              .setStyle(styleMap[b.style || 'primary'] || ButtonStyle.Primary)
          );

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        const msg = await channel.send({
          content: args.prompt.slice(0, DISCORD_LIMITS.messageContent),
          components: [row],
        });

        return JSON.stringify({
          message_id: msg.id,
          buttons: args.buttons.map((b: { id: string }) => b.id),
          note: 'Use await_button_click to wait for user selection',
        });
      },
    }),

    await_button_click: tool({
      description: 'Wait for user to click a button. MUST be called after send_buttons.',
      args: {
        message_id: tool.schema.string().describe('Message ID with buttons'),
        timeout_seconds: tool.schema
          .number()
          .optional()
          .describe('Timeout in seconds (default: 60, max: 300)'),
        allowed_user_ids: tool.schema
          .array(tool.schema.string())
          .optional()
          .describe('Only accept clicks from these user IDs (default: session user only)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);

        const timeout = Math.min(Math.max(args.timeout_seconds ?? 60, 10), 300) * 1000;
        const message = await channel.messages.fetch(args.message_id);

        let allowedUsers = args.allowed_user_ids?.filter(Boolean) ?? [];
        if (allowedUsers.length === 0) {
          const sessionUserId = context?.session?.userId || context?.userId;
          if (sessionUserId) {
            allowedUsers = [sessionUserId];
          }
        }

        const filter = (interaction: any) => {
          if (allowedUsers.length > 0) {
            return allowedUsers.includes(interaction.user.id);
          }
          return true;
        };

        try {
          const interaction = await message.awaitMessageComponent({
            filter,
            componentType: ComponentType.Button,
            time: timeout,
          });

          try {
            await interaction.deferUpdate();
          } catch (error) {
            console.warn('[discord-opencode] Failed to acknowledge button interaction:', error);
          }

          return JSON.stringify({
            button_id: interaction.customId,
            user_id: interaction.user.id,
            username: interaction.user.username,
          });
        } catch {
          return JSON.stringify({
            error: 'timeout',
            button_id: null,
            message: 'No button clicked within timeout period',
          });
        }
      },
    }),

    update_status: tool({
      description: 'Update a message with a status indicator',
      args: {
        message_id: tool.schema.string().describe('Message ID to update'),
        state: tool.schema
          .enum(['processing', 'thinking', 'searching', 'writing', 'done', 'error', 'waiting'])
          .describe('Status state preset'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const STATE_PRESETS: Record<string, string> = {
          processing: '🤖 Processing...',
          thinking: '🧠 Thinking...',
          searching: '🔍 Searching...',
          writing: '✍️ Writing...',
          done: '✅ Done',
          error: '❌ Something went wrong',
          waiting: '⏳ Waiting for input...',
        };

        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const message = await channel.messages.fetch(args.message_id);
        await message.edit(STATE_PRESETS[args.state]);
        return `Status updated to: ${args.state}`;
      },
    }),

    send_file: tool({
      description: 'Send a file attachment to Discord. Files must be in allowed directories.',
      args: {
        file_path: tool.schema.string().describe('Path to file'),
        message: tool.schema.string().optional().describe('Message to include (max 2000 chars)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        if (args.message) {
          const messageError = validateContentLength(
            args.message,
            DISCORD_LIMITS.messageContent,
            'Message'
          );
          if (messageError) return messageError;
        }

        const { error, buffer, realPath } = validateFileAccess(
          args.file_path,
          config.allowedFilePaths,
          config.maxFileSize
        );
        if (error) return error;
        if (!buffer || !realPath) return 'Error: File validation failed';

        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);

        const msg = await channel.send({
          content: args.message || undefined,
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

    start_typing: tool({
      description: 'Show typing indicator (lasts ~10 seconds)',
      args: {
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        await channel.sendTyping();
        return 'Typing indicator started';
      },
    }),

    reply_to_message: tool({
      description: 'Reply to a specific message (shows reply preview)',
      args: {
        message_id: tool.schema.string().describe('Message ID to reply to'),
        content: tool.schema.string().describe('Reply content (max 2000 chars)'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const contentError = validateContentLength(
          args.content,
          DISCORD_LIMITS.messageContent,
          'Content'
        );
        if (contentError) return contentError;

        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const target = await channel.messages.fetch(args.message_id);
        const msg = await target.reply(args.content.slice(0, DISCORD_LIMITS.messageContent));
        return `Reply sent: ${msg.id}`;
      },
    }),

    delete_message: tool({
      description: 'Delete a Discord message',
      args: {
        message_id: tool.schema.string().describe('Message ID to delete'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const message = await channel.messages.fetch(args.message_id);
        await message.delete();
        return `Message deleted: ${args.message_id}`;
      },
    }),

    rename_thread: tool({
      description: 'Rename a Discord thread',
      args: {
        thread_id: tool.schema
          .string()
          .optional()
          .describe('Thread ID (auto-detected from session)'),
        name: tool.schema.string().describe('New thread name (max 100 chars)'),
      },
      async execute(args, context) {
        const threadId = await resolveChannelId(args.thread_id, context);
        const thread = await getChannel(threadId);
        if (!thread.isThread()) {
          return 'Error: Not a thread';
        }
        await thread.setName(args.name.slice(0, 100));
        return `Thread renamed to: ${args.name.slice(0, 100)}`;
      },
    }),

    request_human_input: tool({
      description: 'Ask the user a question and wait for response',
      args: {
        prompt: tool.schema.string().describe('The question to ask'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
        timeout_seconds: tool.schema
          .number()
          .optional()
          .describe('Timeout in seconds (default: 300)'),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const timeout = (args.timeout_seconds ?? 300) * 1000;

        await channel.send(`**Input needed:**\n${args.prompt}`);

        const collected = await channel.awaitMessages({
          filter: (m: any) => !m.author.bot,
          max: 1,
          time: timeout,
        });

        if (collected.size === 0) {
          return 'Error: Timeout waiting for response';
        }

        return collected.first()!.content;
      },
    }),

    request_approval: tool({
      description: 'Ask for yes/no approval before a destructive action',
      args: {
        action: tool.schema.string().describe('Description of the action requiring approval'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);

        await channel.send(
          `**Approval required:**\n${args.action}\n\nReply **yes** to proceed or **no** to cancel.`
        );

        const collected = await channel.awaitMessages({
          filter: (m: any) => !m.author.bot && /^(yes|no|y|n)$/i.test(m.content.trim()),
          max: 1,
          time: 300000,
        });

        if (collected.size === 0) {
          return 'denied: timeout';
        }

        const response = collected.first()!.content.toLowerCase().trim();
        return /^(yes|y)$/i.test(response) ? 'approved' : 'denied';
      },
    }),

    add_reaction: tool({
      description: 'Add an emoji reaction to a message',
      args: {
        message_id: tool.schema.string().describe('Message ID to react to'),
        emoji: tool.schema.string().describe('Emoji to add'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const message = await channel.messages.fetch(args.message_id);
        await message.react(args.emoji);
        return `Reaction ${args.emoji} added`;
      },
    }),

    create_thread_for_conversation: tool({
      description:
        'Create a Discord thread for multi-step work, debugging, extended discussion, or context-dependent questions. Use this when a question cannot be answered directly and requires ongoing dialogue, research, or when the user asks about something that needs back-and-forth interaction.',
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
      async execute(args) {
        const channel = await getChannel(args.channel_id);

        if (channel.type !== ChannelType.GuildText) {
          return JSON.stringify({ error: 'Can only create threads in text channels' });
        }

        const thread = await channel.threads.create({
          name: args.title.slice(0, 100),
          autoArchiveDuration: 60,
        });

        await thread.send(args.initial_message);

        let sessionId = null;
        if (config.enableSessionStore) {
          try {
            const { Database } = await import('bun:sqlite');

            const db = new Database(config.databasePath);
            db.run('PRAGMA journal_mode = WAL');

            sessionId = randomUUID();
            const now = Date.now();
            const agentType = args.agent_type || 'ask';

            db.prepare(`
              INSERT INTO sessions (
                id, discord_thread_id, discord_channel_id, user_id,
                state, agent_type, created_at, updated_at,
                opencode_session_id, project_path, project_name,
                context_encrypted, context_iv, context_tag
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              sessionId,
              thread.id,
              thread.parentId,
              thread.ownerId || 'unknown',
              'idle',
              agentType,
              now,
              now,
              null,
              null,
              null,
              null,
              null,
              null
            );

            db.close();
            console.log(
              `[discord-opencode] Session ${sessionId} registered for thread ${thread.id}`
            );
          } catch (error) {
            console.error(
              `[discord-opencode] Failed to register session for thread ${thread.id}:`,
              error
            );
          }
        }

        return JSON.stringify({
          thread_created: true,
          thread_id: thread.id,
          title: args.title.slice(0, 100),
          session_id: sessionId,
          session_registered: sessionId !== null,
        });
      },
    }),

    get_system_status: tool({
      description: 'Get server system metrics',
      args: {
        metric: tool.schema
          .enum(['uptime', 'disk', 'memory', 'cpu'])
          .describe('Which metric to retrieve'),
      },
      async execute(args) {
        const commands: Record<string, string> = {
          uptime: 'uptime -p',
          disk: 'df -h / | tail -1',
          memory: 'free -h | grep Mem',
          cpu: "top -bn1 | grep 'Cpu(s)' | head -1",
        };
        return execSync(commands[args.metric]).toString().trim();
      },
    }),

    edit_message: tool({
      description: 'Edit an existing Discord message',
      args: {
        message_id: tool.schema.string().describe('Message ID to edit'),
        content: tool.schema.string().describe('New message content (max 2000 chars)'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const message = await channel.messages.fetch(args.message_id);
        await message.edit(args.content.slice(0, 2000));
        return `Message edited: ${message.id}`;
      },
    }),

    get_thread_history: tool({
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
      async execute(args, context) {
        const threadId = await resolveChannelId(args.thread_id, context);
        const thread = await getChannel(threadId);
        if (!thread.isThread()) {
          return JSON.stringify({ error: 'Not a thread' });
        }
        const messages = await thread.messages.fetch({ limit: Math.min(args.limit ?? 20, 50) });
        const history = [...messages.values()].reverse().map((m: any) => ({
          author: m.author.username,
          content: m.content,
          timestamp: m.createdTimestamp,
        }));
        return JSON.stringify(history);
      },
    }),

    notify_human: tool({
      description: 'Send a notification without waiting for response',
      args: {
        message: tool.schema.string().describe('Notification message'),
        mention_user: tool.schema
          .boolean()
          .optional()
          .describe('Whether to mention the thread owner'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
      },
      async execute(args, context) {
        const channelId = await resolveChannelId(args.channel_id, context);
        const channel = await getChannel(channelId);
        const content =
          args.mention_user && channel.isThread()
            ? `<@${channel.ownerId}> ${args.message}`
            : args.message;
        await channel.send(content);
        return 'Notification sent';
      },
    }),

    get_session_context: tool({
      description:
        'Get context about the current conversation/session including recent message history',
      args: {
        thread_id: tool.schema
          .string()
          .optional()
          .describe('Discord thread ID (optional - auto-detected from session)'),
      },
      async execute(args, context) {
        const threadId = await resolveChannelId(args.thread_id, context);
        const thread = await getChannel(threadId);
        if (!thread.isThread()) {
          return JSON.stringify({ error: 'Not a thread' });
        }

        const messages = await thread.messages.fetch({ limit: 30 });
        const history = [...messages.values()].reverse().map((m: any) => ({
          author: m.author.bot ? 'assistant' : 'user',
          username: m.author.username,
          content: m.content,
          timestamp: m.createdTimestamp,
        }));

        return JSON.stringify({
          thread_id: thread.id,
          thread_name: thread.name,
          created_at: thread.createdTimestamp,
          message_count: messages.size,
          history,
        });
      },
    }),
  };

  // Add project commands only if enabled
  if (config.enableProjectCommands) {
    tools.list_projects = tool({
      description: 'List available projects in projects directory',
      args: {},
      async execute() {
        const projectsDir = config.projectsDirectory;
        const entries = readdirSync(projectsDir, { withFileTypes: true });
        const projects = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => e.name);
        return JSON.stringify(projects);
      },
    });

    tools.run_project_command = tool({
      description: 'Run an allowlisted command in a project directory',
      args: {
        project: tool.schema.string().describe('Project name'),
        command: tool.schema
          .enum(['npm test', 'npm run build', 'npm run lint', 'npm install', 'git status'])
          .describe('Command to run'),
      },
      async execute(args) {
        const projectPath = join(config.projectsDirectory, args.project);
        if (!existsSync(projectPath)) {
          return `Error: Project '${args.project}' not found`;
        }
        try {
          const output = execSync(args.command, {
            cwd: projectPath,
            timeout: 60000,
            encoding: 'utf8',
          });
          return output.slice(0, 4000);
        } catch (error: any) {
          return `Error: ${error.message}\n${error.stderr || ''}`.slice(0, 4000);
        }
      },
    });
  }

  return {
    tool: tools,
  };
};
