import { closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface FileAccessResult {
  error: string | null;
  buffer?: Buffer;
  realPath?: string;
}

export function isPathAllowed(realPath: string, allowedPrefixes: string[]): boolean {
  const normalizedPrefixes = allowedPrefixes.map((prefix) => prefix.replace(/\/+$/, ''));
  return normalizedPrefixes.some(
    (prefix) => realPath === prefix || realPath.startsWith(`${prefix}/`)
  );
}

export function validateRealPath(realPath: string): string | null {
  if (realPath.includes(' (deleted)')) {
    return 'Error: File was deleted';
  }
  return null;
}

export function validateFileStats(
  stats: { isFile(): boolean; nlink: number; size: number },
  maxBytes = MAX_FILE_BYTES
): string | null {
  if (!stats.isFile()) {
    return 'Error: Not a regular file';
  }
  if (stats.nlink > 1) {
    return `Error: File has multiple hardlinks (${stats.nlink}), refusing for security`;
  }
  if (stats.size > maxBytes) {
    const maxMb = (maxBytes / 1024 / 1024).toFixed(0);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    return `Error: File exceeds ${maxMb}MB limit (${sizeMb}MB)`;
  }
  return null;
}

export function validateFileAccess(
  filePath: string,
  allowedPrefixes?: string[],
  maxBytes = MAX_FILE_BYTES
): FileAccessResult {
  const resolvedPath = resolve(filePath);

  let fd: number | null = null;
  try {
    fd = openSync(resolvedPath, 'r');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: `Error: Cannot open file: ${message}` };
  }

  try {
    let realPath: string;
    try {
      realPath = realpathSync(`/proc/self/fd/${fd}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: `Error: Cannot resolve file path: ${message}` };
    }

    const realPathError = validateRealPath(realPath);
    if (realPathError) {
      return { error: realPathError };
    }

    let resolvedPrefixes = allowedPrefixes;
    if (!resolvedPrefixes || resolvedPrefixes.length === 0) {
      try {
        resolvedPrefixes = [realpathSync(resolve(homedir(), 'projects')), realpathSync('/tmp')];
      } catch (error) {
        console.error('[discord-opencode] Failed to resolve allowed prefixes:', error);
        return { error: 'Error: Server configuration error - allowed paths not resolvable' };
      }
    }

    if (!isPathAllowed(realPath, resolvedPrefixes)) {
      return { error: `Error: File must be in allowed directory. Real path: ${realPath}` };
    }

    const stats = fstatSync(fd);
    const statsError = validateFileStats(stats, maxBytes);
    if (statsError) {
      return { error: statsError };
    }

    const buffer = readFileSync(fd);
    return { error: null, buffer, realPath };
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}
