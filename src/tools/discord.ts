import { randomUUID } from 'node:crypto';
import { Client, GatewayIntentBits, TextChannel, ThreadChannel } from 'discord.js';
import type { PluginConfig } from '../config.js';

let discordClient: Client | null = null;
let sessionSchemaChecked = false;
let hasRemoteApprovalColumn = false;

export interface ToolContext {
  agent?: string;
  sessionID?: string;
  messageID?: string;
  session?: {
    userId?: string;
    channelId?: string;
    threadId?: string;
  };
  userId?: string;
  channelId?: string;
  threadId?: string;
}

export interface ResolvedChannel {
  channelId: string;
  fromSession: boolean;
}

const CHUNK_LIMIT = 1900;
const REMOTE_APPROVAL_COLUMN = 'remote_allowed';

export function splitMessageContent(text: string, maxLength = CHUNK_LIMIT): string[] {
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

export async function getClient(config: PluginConfig): Promise<Client> {
  if (discordClient?.isReady()) return discordClient;

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

export async function getChannel(config: PluginConfig, channelId: string): Promise<TextChannel> {
  const client = await getClient(config);
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    throw new Error(`Invalid channel: ${channelId}`);
  }
  return channel as TextChannel;
}

async function openSessionDb(config: PluginConfig, writable = false) {
  const { Database } = await import('bun:sqlite');
  if (!config.databasePath) {
    throw new Error('Session database path is not configured.');
  }
  try {
    return new Database(config.databasePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to open session database at ${config.databasePath}: ${message}`);
  }
}

async function checkSessionSchema(db: any) {
  if (sessionSchemaChecked) return;
  try {
    const columns = db.prepare('PRAGMA table_info(sessions)').all();
    hasRemoteApprovalColumn = columns.some((col: { name: string }) => col.name === REMOTE_APPROVAL_COLUMN);
  } catch (error) {
    console.warn('[discord-opencode] Failed to inspect session schema:', error);
  } finally {
    sessionSchemaChecked = true;
  }
}

export async function ensureRemoteApprovalColumn(config: PluginConfig) {
  const db = await openSessionDb(config, true);
  try {
    await checkSessionSchema(db);
    if (hasRemoteApprovalColumn) return;

    db.run(`ALTER TABLE sessions ADD COLUMN ${REMOTE_APPROVAL_COLUMN} INTEGER NOT NULL DEFAULT 0`);
    hasRemoteApprovalColumn = true;
  } catch (error) {
    console.error('[discord-opencode] Failed to add remote approval column:', error);
  } finally {
    db.close();
  }
}

async function getThreadIdFromSession(
  config: PluginConfig,
  opencodeSessionId: string | undefined
): Promise<{ threadId: string | null; remoteAllowed: boolean } | null> {
  if (!opencodeSessionId) return null;
  if (!config.enableSessionStore) return null;

  try {
    const db = await openSessionDb(config, false);
    try {
      await checkSessionSchema(db);

      if (hasRemoteApprovalColumn) {
        const row = db
          .prepare(
            `SELECT discord_thread_id, ${REMOTE_APPROVAL_COLUMN} as remote_allowed FROM sessions WHERE opencode_session_id = ?`
          )
          .get(opencodeSessionId);
        return {
          threadId: row?.discord_thread_id || null,
          remoteAllowed: row?.remote_allowed === 1,
        };
      }

      const row = db
        .prepare('SELECT discord_thread_id FROM sessions WHERE opencode_session_id = ?')
        .get(opencodeSessionId);
      return {
        threadId: row?.discord_thread_id || null,
        remoteAllowed: false,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('[discord-opencode] Failed to lookup session:', error);
    return null;
  }
}

export async function resolveChannelId(
  config: PluginConfig,
  explicitChannelId: string | undefined,
  context: ToolContext,
  requireRemoteApproval = true,
  preferExplicit = false
): Promise<ResolvedChannel> {
  if (preferExplicit && explicitChannelId) {
    return { channelId: explicitChannelId, fromSession: false };
  }
  // PRIORITY 1: Always try session lookup first - trust database over AI
  if (config.enableSessionStore) {
    const sessionId = context?.sessionID;
    if (sessionId) {
      const session = await getThreadIdFromSession(config, sessionId);
      if (session?.threadId) {
        if (requireRemoteApproval && config.requireRemoteApproval && !session.remoteAllowed) {
          if (explicitChannelId) {
            return { channelId: explicitChannelId, fromSession: false };
          }
          throw new Error(
            'Remote Discord continuation is not approved for this session. ' +
              'Ask the user to approve remote Discord usage or provide channel_id.'
          );
        }

        if (explicitChannelId && explicitChannelId !== session.threadId) {
          console.log(
            `[discord-opencode] Ignoring AI channel_id ${explicitChannelId}, using session-resolved ${session.threadId}`
          );
        }
        return { channelId: session.threadId, fromSession: true };
      }
    }
  }

  // PRIORITY 2: Fall back to explicit arg only if session lookup fails
  if (explicitChannelId) return { channelId: explicitChannelId, fromSession: false };

  if (config.defaultChannelId) {
    return { channelId: config.defaultChannelId, fromSession: false };
  }

  throw new Error(
    'Could not resolve channel from session or args. ' +
      'Ensure this is running in an approved session or provide channel_id.'
  );
}

export async function approveRemoteSession(
  config: PluginConfig,
  opencodeSessionId: string
): Promise<boolean> {
  if (!config.enableSessionStore) return false;

  try {
    await ensureRemoteApprovalColumn(config);
    const db = await openSessionDb(config, true);
    try {
      db.prepare(
        `UPDATE sessions SET ${REMOTE_APPROVAL_COLUMN} = 1 WHERE opencode_session_id = ?`
      ).run(opencodeSessionId);
    } finally {
      db.close();
    }
    return true;
  } catch (error) {
    console.error('[discord-opencode] Failed to approve remote session:', error);
    return false;
  }
}

export async function registerThreadSession(
  config: PluginConfig,
  thread: ThreadChannel,
  agentType: 'ask' | 'project'
): Promise<string | null> {
  if (!config.enableSessionStore) return null;

  try {
    const db = await openSessionDb(config, true);
    try {
      db.run('PRAGMA journal_mode = WAL');

      await ensureRemoteApprovalColumn(config);

      const sessionId = randomUUID();
      const now = Date.now();

      if (hasRemoteApprovalColumn) {
        db.prepare(`
          INSERT INTO sessions (
            id, discord_thread_id, discord_channel_id, user_id,
            state, agent_type, created_at, updated_at,
            opencode_session_id, project_path, project_name,
            context_encrypted, context_iv, context_tag,
            ${REMOTE_APPROVAL_COLUMN}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          null,
          0
        );
      } else {
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
      }

      console.log(`[discord-opencode] Session ${sessionId} registered for thread ${thread.id}`);
      return sessionId;
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(
      `[discord-opencode] Failed to register session for thread ${thread.id}:`,
      error
    );
    return null;
  }
}
