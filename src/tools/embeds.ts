import { EmbedBuilder } from 'discord.js';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import {
  DISCORD_LIMITS,
  validateContentLength,
  validateEmbedLength,
  validateField,
} from '../validation.js';
import { getChannel, resolveChannelId, type ToolContext } from './discord.js';
import { withUserConfirmation } from './wrappers.js';

interface EmbedArgs {
  content?: string;
  title?: string;
  description?: string;
  color?: 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'orange';
  color_hex?: string;
  url?: string;
  author?: string;
  author_url?: string;
  author_icon?: string;
  thumbnail?: string;
  image?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  footer_icon?: string;
  timestamp?: boolean;
  channel_id?: string;
}

const COLORS: Record<string, number> = {
  red: 0xe74c3c,
  green: 0x2ecc71,
  blue: 0x3498db,
  yellow: 0xffff00,
  purple: 0x9b59b6,
  orange: 0xe67e22,
};

function parseHexColor(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/^#/, '').replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 16);
}

export function buildEmbedTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    send_embed: withUserConfirmation('send_embed', allowedTools, {
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
        color_hex: tool.schema
          .string()
          .optional()
          .describe('Hex color like #2ecc71 or 0x2ecc71'),
        url: tool.schema.string().optional().describe('Title link URL'),
        author: tool.schema.string().optional().describe('Author name'),
        author_url: tool.schema.string().optional().describe('Author link URL'),
        author_icon: tool.schema.string().optional().describe('Author icon URL'),
        thumbnail: tool.schema.string().optional().describe('Thumbnail image URL'),
        image: tool.schema.string().optional().describe('Main image URL'),
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
        footer_icon: tool.schema.string().optional().describe('Footer icon URL'),
        timestamp: tool.schema.boolean().optional().describe('Add current timestamp'),
        channel_id: tool.schema.string().optional(),
      },
      async execute(args: Record<string, unknown>, context: ToolContext) {
        const {
          content,
          title,
          description,
          color,
          color_hex,
          url,
          author,
          author_url,
          author_icon,
          thumbnail,
          image,
          fields,
          footer,
          footer_icon,
          timestamp,
          channel_id,
        } = args as EmbedArgs;

        if (content) {
          const contentError = validateContentLength(
            content,
            DISCORD_LIMITS.messageContent,
            'Content'
          );
          if (contentError) return contentError;
        }

        if (title && title.length > DISCORD_LIMITS.embedTitle) {
          return `Error: Title exceeds ${DISCORD_LIMITS.embedTitle} characters`;
        }
        if (description && description.length > DISCORD_LIMITS.embedDescription) {
          return `Error: Description exceeds ${DISCORD_LIMITS.embedDescription} characters`;
        }
        if (footer && footer.length > DISCORD_LIMITS.embedFooter) {
          return `Error: Footer exceeds ${DISCORD_LIMITS.embedFooter} characters`;
        }

        if (fields) {
          if (fields.length > DISCORD_LIMITS.embedFields) {
            return `Error: Maximum ${DISCORD_LIMITS.embedFields} fields allowed`;
          }
          for (const field of fields) {
            const fieldError = validateField(field);
            if (fieldError) return fieldError;
          }
        }

        const lengthError = validateEmbedLength({
          title,
          description,
          footer,
          fields,
        });
        if (lengthError) return lengthError;

        const channelId = await resolveChannelId(config, channel_id, context, true);
        const channel = await getChannel(config, channelId.channelId);

        const embed = new EmbedBuilder();
        if (title) embed.setTitle(title.slice(0, DISCORD_LIMITS.embedTitle));
        if (description) {
          embed.setDescription(description.slice(0, DISCORD_LIMITS.embedDescription));
        }
        if (url) embed.setURL(url);

        const parsedColor = parseHexColor(color_hex) ?? (color ? COLORS[color] : null);
        if (parsedColor) embed.setColor(parsedColor);

        if (author) {
          embed.setAuthor({
            name: author.slice(0, DISCORD_LIMITS.embedTitle),
            url: author_url,
            iconURL: author_icon,
          });
        }
        if (thumbnail) embed.setThumbnail(thumbnail);
        if (image) embed.setImage(image);
        if (fields) embed.addFields(fields.slice(0, DISCORD_LIMITS.embedFields));
        if (footer) {
          embed.setFooter({
            text: footer.slice(0, DISCORD_LIMITS.embedFooter),
            iconURL: footer_icon,
          });
        }
        if (timestamp) embed.setTimestamp();

        const msg = await channel.send({
          content: content?.slice(0, DISCORD_LIMITS.messageContent) || undefined,
          embeds: [embed],
        });
        return `Embed sent: ${msg.id}`;
      },
    }),
  };
}
