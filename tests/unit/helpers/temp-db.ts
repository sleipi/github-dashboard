import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function createTempDbPath(prefix: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, dbPath: join(dir, 'github-dashboard.db') }
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
