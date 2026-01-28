import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ThreadChannel,
} from 'discord.js';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import {
  DISCORD_LIMITS,
  validateButtonPrompt,
  validateButtons,
} from '../validation.js';
import {
  approveRemoteSession,
  getChannel,
  resolveChannelId,
  type ToolContext,
} from './discord.js';
import { withUserConfirmation } from './wrappers.js';

export function buildInteractiveTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    send_buttons: withUserConfirmation('send_buttons', allowedTools, {
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
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { prompt, buttons, channel_id } = args as {
          prompt: string;
          buttons: { id: string; label: string; style?: string }[];
          channel_id?: string;
        };
        const promptError = validateButtonPrompt(prompt);
        if (promptError) return promptError;

        const buttonsError = validateButtons(buttons);
        if (buttonsError) return buttonsError;

        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);

        const styleMap: Record<string, ButtonStyle> = {
          primary: ButtonStyle.Primary,
          secondary: ButtonStyle.Secondary,
          success: ButtonStyle.Success,
          danger: ButtonStyle.Danger,
        };

        const components = buttons
          .slice(0, DISCORD_LIMITS.buttonsPerRow)
          .map((button) =>
            new ButtonBuilder()
              .setCustomId(button.id.slice(0, DISCORD_LIMITS.buttonCustomId))
              .setLabel(button.label.slice(0, DISCORD_LIMITS.buttonLabel))
              .setStyle(styleMap[button.style || 'primary'] || ButtonStyle.Primary)
          );

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(components);
        const msg = await channel.send({
          content: prompt.slice(0, DISCORD_LIMITS.messageContent),
          components: [row],
        });

        return JSON.stringify({
          message_id: msg.id,
          buttons: buttons.map((b) => b.id),
          note: 'Use await_button_click to wait for user selection',
        });
      },
    }),

    await_button_click: withUserConfirmation('await_button_click', allowedTools, {
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
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { message_id, timeout_seconds, allowed_user_ids, channel_id } = args as {
          message_id: string;
          timeout_seconds?: number;
          allowed_user_ids?: string[];
          channel_id?: string;
        };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);

        const timeout = Math.min(Math.max(timeout_seconds ?? 60, 10), 300) * 1000;
        const message = await channel.messages.fetch(message_id);

        let allowedUsers = allowed_user_ids?.filter(Boolean) ?? [];
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

    request_human_input: withUserConfirmation('request_human_input', allowedTools, {
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
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { prompt, channel_id, timeout_seconds } = args as {
          prompt: string;
          channel_id?: string;
          timeout_seconds?: number;
        };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        const timeout = (timeout_seconds ?? 300) * 1000;

        await channel.send(`**Input needed:**\n${prompt}`);

        const collected = await channel.awaitMessages({
          filter: (message) => !message.author.bot,
          max: 1,
          time: timeout,
        });

        if (collected.size === 0) {
          return 'Error: Timeout waiting for response';
        }

        return collected.first()!.content;
      },
    }),

    request_approval: withUserConfirmation('request_approval', allowedTools, {
      description: 'Ask for yes/no approval before a destructive action',
      args: {
        action: tool.schema.string().describe('Description of the action requiring approval'),
        channel_id: tool.schema
          .string()
          .optional()
          .describe('Discord channel/thread ID (optional - auto-detected from session)'),
        timeout_seconds: tool.schema
          .number()
          .optional()
          .describe('Timeout in seconds (default: 300)'),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { action, channel_id, timeout_seconds } = args as {
          action: string;
          channel_id?: string;
          timeout_seconds?: number;
        };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('approve')
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('deny')
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );

        const message = await channel.send({
          content: `**Approval required:**\n${action}`,
          components: [row],
        });

        try {
          const interaction = await message.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: (timeout_seconds ?? 300) * 1000,
            filter: (interaction) => !interaction.user.bot,
          });

          try {
            await interaction.deferUpdate();
          } catch (error) {
            console.warn('[discord-opencode] Failed to acknowledge approval:', error);
          }

          return interaction.customId === 'approve' ? 'approved' : 'denied';
        } catch {
          return 'denied: timeout';
        }
      },
    }),

    notify_human: withUserConfirmation('notify_human', allowedTools, {
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
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const { message, mention_user, channel_id } = args as {
          message: string;
          mention_user?: boolean;
          channel_id?: string;
        };
        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);
        let content = message;
        if (mention_user && channel.isThread()) {
          const threadChannel = channel as ThreadChannel;
          content = `<@${threadChannel.ownerId}> ${message}`;
        }
        await channel.send(content);
        return 'Notification sent';
      },
    }),

    approve_remote_session: withUserConfirmation('approve_remote_session', allowedTools, {
      description: 'Approve the current session for remote Discord continuation',
      args: {
        opencode_session_id: tool.schema
          .string()
          .optional()
          .describe('Explicit OpenCode session ID (defaults to current session)'),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        if (!config.enableSessionStore) {
          return 'Error: Session store is disabled; cannot approve session.';
        }

        const { opencode_session_id } = args as { opencode_session_id?: string };
        const sessionId = opencode_session_id || context?.sessionID;
        if (!sessionId) {
          return 'Error: No session ID available to approve.';
        }

        const approved = await approveRemoteSession(config, sessionId);
        return approved ? 'Remote Discord continuation approved.' : 'Error: Approval failed.';
      },
    }),
  };
}
