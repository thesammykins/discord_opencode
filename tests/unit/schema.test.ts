import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapSchema, ensureSchema, migrateSchema } from '../../src/schema.js';

const TEST_DIR = '/tmp/discord-opencode-unit-tests';
let testDbPath = '';

function freshDbPath(): string {
  testDbPath = join(TEST_DIR, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  return testDbPath;
}

afterEach(() => {
  if (testDbPath && existsSync(testDbPath)) {
    rmSync(testDbPath, { force: true });
    // Clean up WAL/SHM files
    rmSync(`${testDbPath}-wal`, { force: true });
    rmSync(`${testDbPath}-shm`, { force: true });
  }
});

describe('bootstrapSchema', () => {
  test('creates sessions table in a new database', () => {
    const dbPath = freshDbPath();
    bootstrapSchema(dbPath);

    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath);
    try {
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('discord_thread_id');
      expect(columnNames).toContain('discord_channel_id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('state');
      expect(columnNames).toContain('agent_type');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      expect(columnNames).toContain('opencode_session_id');
      expect(columnNames).toContain('remote_allowed');
    } finally {
      db.close();
    }
  });

  test('creates indexes', () => {
    const dbPath = freshDbPath();
    bootstrapSchema(dbPath);

    const db = new Database(dbPath);
    try {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_sessions_opencode_session_id');
      expect(indexNames).toContain('idx_sessions_discord_thread_id');
    } finally {
      db.close();
    }
  });

  test('enables WAL mode', () => {
    const dbPath = freshDbPath();
    bootstrapSchema(dbPath);

    const db = new Database(dbPath);
    try {
      const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(result.journal_mode).toBe('wal');
    } finally {
      db.close();
    }
  });

  test('is idempotent — running twice does not error', () => {
    const dbPath = freshDbPath();
    bootstrapSchema(dbPath);
    bootstrapSchema(dbPath);

    const db = new Database(dbPath);
    try {
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      expect(columns.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  test('creates parent directory if missing', () => {
    const nested = join(TEST_DIR, `nested-${Date.now()}`, 'deep', 'test.db');
    testDbPath = nested;
    bootstrapSchema(nested);

    expect(existsSync(nested)).toBe(true);

    // Clean up nested dirs
    const nestedParent = join(TEST_DIR, nested.split(TEST_DIR + '/')[1].split('/')[0]);
    rmSync(nestedParent, { recursive: true, force: true });
  });
});

describe('migrateSchema', () => {
  test('adds remote_allowed column when missing', () => {
    const dbPath = freshDbPath();

    // Create a table WITHOUT remote_allowed
    const db = new Database(dbPath);
    db.run(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        discord_thread_id TEXT,
        discord_channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'idle',
        agent_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        opencode_session_id TEXT,
        project_path TEXT,
        project_name TEXT,
        context_encrypted TEXT,
        context_iv TEXT,
        context_tag TEXT
      )
    `);
    db.close();

    migrateSchema(dbPath);

    const db2 = new Database(dbPath);
    try {
      const columns = db2.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('remote_allowed');
    } finally {
      db2.close();
    }
  });

  test('is a no-op when remote_allowed already exists', () => {
    const dbPath = freshDbPath();
    bootstrapSchema(dbPath);

    // Should not throw
    migrateSchema(dbPath);

    const db = new Database(dbPath);
    try {
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      const remoteAllowedCount = columns.filter((c) => c.name === 'remote_allowed').length;
      expect(remoteAllowedCount).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('ensureSchema', () => {
  test('creates table and migrates in one call', () => {
    const dbPath = freshDbPath();
    ensureSchema(dbPath);

    const db = new Database(dbPath);
    try {
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('remote_allowed');

      const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(result.journal_mode).toBe('wal');
    } finally {
      db.close();
    }
  });

  test('works on an existing database with full schema', () => {
    const dbPath = freshDbPath();
    ensureSchema(dbPath);
    ensureSchema(dbPath);

    const db = new Database(dbPath);
    try {
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
      expect(columns.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
