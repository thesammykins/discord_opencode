import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const { Database } = await import('bun:sqlite');

const REMOTE_ALLOWED_COLUMN = 'remote_allowed';
const CREATE_SESSIONS_TABLE = `
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
  )
`;
const CREATE_INDEX_OPENCODE_SESSION_ID =
  'CREATE INDEX IF NOT EXISTS idx_sessions_opencode_session_id ON sessions(opencode_session_id)';
const CREATE_INDEX_DISCORD_THREAD_ID =
  'CREATE INDEX IF NOT EXISTS idx_sessions_discord_thread_id ON sessions(discord_thread_id)';

type SqliteDatabase = InstanceType<typeof Database>;

function ensureParentDirectory(dbPath: string): void {
  const parentDir = dirname(dbPath);
  mkdirSync(parentDir, { recursive: true });
}

function openDatabase(dbPath: string): SqliteDatabase {
  ensureParentDirectory(dbPath);
  try {
    return new Database(dbPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to open session database at ${dbPath}: ${message}`);
  }
}

function runWritableStatement(db: SqliteDatabase, dbPath: string, sql: string): void {
  try {
    db.run(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Session database at ${dbPath} is not writable: ${message}`);
  }
}

export function bootstrapSchema(dbPath: string): void {
  const db = openDatabase(dbPath);
  try {
    runWritableStatement(db, dbPath, 'PRAGMA journal_mode = WAL');
    runWritableStatement(db, dbPath, CREATE_SESSIONS_TABLE);
    runWritableStatement(db, dbPath, CREATE_INDEX_OPENCODE_SESSION_ID);
    runWritableStatement(db, dbPath, CREATE_INDEX_DISCORD_THREAD_ID);
  } finally {
    db.close();
  }
}

export function migrateSchema(dbPath: string): void {
  const db = openDatabase(dbPath);
  try {
    const columns = db
      .prepare('PRAGMA table_info(sessions)')
      .all() as Array<{ name: string }>;
    const hasRemoteAllowed = columns.some((column) => column.name === REMOTE_ALLOWED_COLUMN);

    if (!hasRemoteAllowed) {
      runWritableStatement(
        db,
        dbPath,
        `ALTER TABLE sessions ADD COLUMN ${REMOTE_ALLOWED_COLUMN} INTEGER NOT NULL DEFAULT 0`
      );
    }
  } finally {
    db.close();
  }
}

export function ensureSchema(dbPath: string): void {
  bootstrapSchema(dbPath);
  migrateSchema(dbPath);
}
