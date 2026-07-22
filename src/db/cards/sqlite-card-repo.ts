import type { Database } from 'bun:sqlite'
import type { CardRepo } from './card-repo.ts'

type PinnedRow = { full_name: string; sort_order: number; pinned_at: string; color: string | null }

export function createSqliteCardRepo(db: Database): CardRepo {
  const selectAll = db.query<PinnedRow, []>(
    'SELECT full_name, sort_order, pinned_at, color FROM pinned_repos ORDER BY sort_order ASC',
  )
  const selectOne = db.query<{ count: number }, [string]>(
    'SELECT COUNT(*) as count FROM pinned_repos WHERE full_name = ?',
  )
  const maxOrder = db.query<{ max: number | null }, []>(
    'SELECT MAX(sort_order) as max FROM pinned_repos',
  )
  const selectColor = db.query<{ color: string | null }, [string]>(
    'SELECT color FROM pinned_repos WHERE full_name = ?',
  )

  return {
    getPinned() {
      return selectAll.all().map((row) => ({
        fullName: row.full_name,
        sortOrder: row.sort_order,
        pinnedAt: new Date(row.pinned_at),
        color: row.color,
      }))
    },

    isPinned(fullName) {
      return (selectOne.get(fullName)?.count ?? 0) > 0
    },

    pin(fullName) {
      const nextOrder = (maxOrder.get()?.max ?? -1) + 1
      db.run(
        'INSERT OR IGNORE INTO pinned_repos (full_name, sort_order, pinned_at) VALUES (?, ?, ?)',
        [fullName, nextOrder, new Date().toISOString()],
      )
    },

    unpin(fullName) {
      db.run('DELETE FROM pinned_repos WHERE full_name = ?', [fullName])
    },

    reorder(fullNames) {
      db.transaction(() => {
        fullNames.forEach((name, i) => {
          db.run('UPDATE pinned_repos SET sort_order = ? WHERE full_name = ?', [i, name])
        })
      })()
    },

    getColor(fullName) {
      return selectColor.get(fullName)?.color ?? null
    },

    setColor(fullName, color) {
      db.run('UPDATE pinned_repos SET color = ? WHERE full_name = ?', [color, fullName])
    },
  }
}
