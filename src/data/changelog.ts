import type { ChangelogEntry } from '../domain/types/Changelog'

/**
 * Curated changelog entries shown in the "What's New" modal.
 * Only include changes users would actually care about.
 *
 * When making commits, consider adding an entry here if the change
 * is user-facing (new feature, meaningful fix, or UX improvement).
 */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  // 2026-02-23
  { hash: '0000000', date: '2026-02-23', message: 'Ported to INAV — analyzes INAV blackbox logs with INAV-specific tuning recommendations', category: 'feature' },
]
