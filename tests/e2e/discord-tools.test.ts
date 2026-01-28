import { beforeAll, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_CHANNEL_ID = process.env.DISCORD_TEST_CHANNEL_ID || '1458038470466474098';
const REQUIRED_ENV = ['DISCORD_TOKEN', 'DISCORD_APP_ID', 'DISCORD_GUILD_ID'];

const shouldRun = REQUIRED_ENV.every((key) => Boolean(process.env[key]));

if (!shouldRun) {
  test.skip('discord e2e requires DISCORD_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID', () => {});
} else {
  const dbPath = '/tmp/discord_opencode_e2e.db';
  const configPath = '/tmp/discord_opencode_e2e.json';
  const sessionId = 'e2e-session';
  const now = Date.now();
  const allowedUsers = (process.env.ALLOWED_USERS || '').split(',').map((id) => id.trim());
  const userId = allowedUsers.find(Boolean) || 'unknown';

  beforeAll(() => {
    if (existsSync(dbPath)) {
      rmSync(dbPath);
    }

    if (existsSync(configPath)) {
      rmSync(configPath);
    }

    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_path TEXT,
        project_name TEXT,
        discord_thread_id TEXT,
        discord_channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'idle',
        agent_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        opencode_session_id TEXT,
        context_encrypted TEXT,
        context_iv TEXT,
        context_tag TEXT,
        remote_allowed INTEGER NOT NULL DEFAULT 0
      );
    `);

    db.prepare(`
      INSERT INTO sessions (
        id, discord_thread_id, discord_channel_id, user_id,
        state, agent_type, created_at, updated_at,
        opencode_session_id, project_path, project_name,
        context_encrypted, context_iv, context_tag,
        remote_allowed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'e2e-session-row',
      TEST_CHANNEL_ID,
      TEST_CHANNEL_ID,
      userId,
      'idle',
      'ask',
      now,
      now,
      sessionId,
      null,
      null,
      null,
      null,
      null,
      0
    );

    db.close();

    const config = {
      discordToken: process.env.DISCORD_TOKEN || '',
      defaultChannelId: TEST_CHANNEL_ID,
      databasePath: dbPath,
      allowedFilePaths: [process.cwd(), '/tmp'],
      maxFileSize: 8_388_608,
      projectsDirectory: process.cwd(),
      allowedCommands: ['npm test', 'npm run build', 'npm run lint', 'npm install', 'git status'],
      enableSessionStore: true,
      enableProjectCommands: true,
      requireRemoteApproval: true,
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    process.env.DISCORD_OPENCODE_CONFIG_PATH = configPath;
  });

  test('discord tools e2e', { timeout: 60000 }, async () => {
    const plugin = (await import('../../dist/index.js')).default;
    const { tool: tools } = await plugin();
    const anyTools = tools as Record<string, any>;
    const context: Record<string, unknown> = { sessionID: sessionId, userId };

    const approvalError = await anyTools.send_discord_message.execute(
      { content: 'e2e: gated send' },
      context
    );
    expect(String(approvalError)).toContain('Remote Discord continuation is not approved');

    const approvalResult = await anyTools.approve_remote_session.execute({}, context);
    expect(approvalResult).toBe('Remote Discord continuation approved.');

    const sendResult = await anyTools.send_discord_message.execute(
      { content: 'e2e: message sent' },
      context
    );
    expect(String(sendResult)).toContain('Message sent:');
    const messageId = String(sendResult).split(': ').pop() || '';

    const statusResult = await anyTools.update_status.execute(
      { message_id: messageId, state: 'processing', custom: '🔄 E2E processing' },
      context
    );
    expect(statusResult).toBe('Status updated to: processing');

    const editResult = await anyTools.edit_message.execute(
      { message_id: messageId, content: 'e2e: edited content' },
      context
    );
    expect(String(editResult)).toContain('Message edited:');

    const replyResult = await anyTools.reply_to_message.execute(
      { message_id: messageId, content: 'e2e: reply content' },
      context
    );
    expect(String(replyResult)).toContain('Reply sent:');

    const reactionResult = await anyTools.add_reaction.execute(
      { message_id: messageId, emoji: '👍' },
      context
    );
    expect(reactionResult).toContain('Reaction');

    const embedResult = await anyTools.send_embed.execute(
      {
        title: 'E2E Embed',
        description: 'Embed body',
        color: 'green',
        color_hex: '#2ecc71',
        url: 'https://example.com',
        author: 'E2E Bot',
        author_url: 'https://example.com',
        author_icon: 'https://example.com/icon.png',
        thumbnail: 'https://example.com/thumb.png',
        image: 'https://example.com/image.png',
        footer: 'Footer',
        footer_icon: 'https://example.com/footer.png',
        timestamp: true,
        content: 'Embed above text',
      },
      context
    );
    expect(String(embedResult)).toContain('Embed sent:');

    const buttonResult = await anyTools.send_buttons.execute(
      {
        prompt: 'Pick an option',
        buttons: [
          { id: 'yes', label: 'Yes', style: 'success' },
          { id: 'no', label: 'No', style: 'danger' },
        ],
      },
      context
    );
    const buttonPayload = JSON.parse(String(buttonResult));
    expect(buttonPayload.message_id).toBeTruthy();

    const buttonAwait = await anyTools.await_button_click.execute(
      { message_id: buttonPayload.message_id, timeout_seconds: 1 },
      context
    );
    const buttonAwaitPayload = JSON.parse(String(buttonAwait));
    expect(buttonAwaitPayload.error).toBe('timeout');

    const inputResult = await anyTools.request_human_input.execute(
      { prompt: 'E2E input', timeout_seconds: 1 },
      context
    );
    expect(String(inputResult)).toContain('Timeout');

    const approvalTimeout = await anyTools.request_approval.execute(
      { action: 'Approve test action', timeout_seconds: 1 },
      context
    );
    expect(approvalTimeout).toBe('denied: timeout');

    const notifyResult = await anyTools.notify_human.execute(
      { message: 'e2e: notify' },
      context
    );
    expect(notifyResult).toBe('Notification sent');

    const typingResult = await anyTools.start_typing.execute({}, context);
    expect(typingResult).toBe('Typing indicator started');

    const tempPath = join('/tmp', `discord-opencode-e2e-${Date.now()}.txt`);
    writeFileSync(tempPath, 'e2e file contents', 'utf8');
    const fileResult = await anyTools.send_file.execute(
      { file_path: tempPath, message: 'e2e file' },
      context
    );
    expect(String(fileResult)).toContain('File sent:');

    const threadResult = await anyTools.create_thread_for_conversation.execute(
      {
        channel_id: TEST_CHANNEL_ID,
        title: `e2e thread ${Date.now()}`,
        initial_message: 'e2e: thread created',
        agent_type: 'ask',
      },
      context
    );
    const threadPayload = JSON.parse(String(threadResult));
    expect(threadPayload.thread_created).toBe(true);
    expect(threadPayload.thread_id).toBeTruthy();

    const renameResult = await anyTools.rename_thread.execute(
      { thread_id: threadPayload.thread_id, name: 'e2e thread renamed' },
      context
    );
    expect(String(renameResult)).toContain('Thread renamed');

    const historyResult = await anyTools.get_thread_history.execute(
      { thread_id: threadPayload.thread_id, limit: 5 },
      context
    );
    const historyPayload = JSON.parse(String(historyResult));
    expect(Array.isArray(historyPayload)).toBe(true);

    const contextResult = await anyTools.get_session_context.execute(
      { thread_id: threadPayload.thread_id },
      context
    );
    const sessionPayload = JSON.parse(String(contextResult));
    expect(sessionPayload.thread_id).toBe(threadPayload.thread_id);

    const healthResult = await anyTools.get_discord_health.execute({}, context);
    const healthPayload = JSON.parse(String(healthResult));
    expect(healthPayload.connected).toBe(true);

    const systemResult = await anyTools.get_system_status.execute({ metric: 'uptime' }, context);
    expect(String(systemResult).length).toBeGreaterThan(0);

    const listResult = await anyTools.list_projects.execute({}, context);
    const listPayload = JSON.parse(String(listResult));
    expect(Array.isArray(listPayload)).toBe(true);

    const runResult = await anyTools.run_project_command.execute(
      { project: 'src', command: 'git status' },
      context
    );
    expect(String(runResult).length).toBeGreaterThan(0);

    const deleteResult = await anyTools.delete_message.execute(
      { message_id: messageId },
      context
    );
    expect(String(deleteResult)).toContain('Message deleted');
  });
}
