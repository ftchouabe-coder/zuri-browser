import { useMemo, useState, type JSX } from 'react'
import type { HistoryEntry } from '@shared/types'
import type { Translate } from '../i18n'
import { Panel } from '../components/Panel'
import { Icon } from '../components/Icons'
import { dayBucket, formatDate, formatTime, hostOf, initials } from '../utils'

interface HistoryPanelProps {
  entries: HistoryEntry[]
  t: Translate
  onOpen: (url: string) => void
  onRemove: (url: string) => Promise<void>
  onClear: () => Promise<void>
  onClose: () => void
}

export function HistoryPanel({
  entries,
  t,
  onOpen,
  onRemove,
  onClear,
  onClose
}: HistoryPanelProps): JSX.Element {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(needle) || entry.url.toLowerCase().includes(needle)
    )
  }, [entries, query])

  const groups = useMemo(() => {
    const buckets: Record<'today' | 'yesterday' | 'older', HistoryEntry[]> = {
      today: [],
      yesterday: [],
      older: []
    }
    for (const entry of filtered) buckets[dayBucket(entry.visitedAt)].push(entry)
    return buckets
  }, [filtered])

  return (
    <Panel
      title={t('history.title')}
      subtitle={`${filtered.length} ${filtered.length === 1 ? 'page' : 'pages'}`}
      onClose={onClose}
      wide
      actions={
        entries.length > 0 ? (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              if (window.confirm(`${t('history.clear')} ?`)) void onClear()
            }}
          >
            {t('history.clear')}
          </button>
        ) : null
      }
    >
      <div className="panel-search">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('history.search')}
          aria-label={t('history.search')}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Icon name="history" size={28} />
          <p>{t('history.empty')}</p>
        </div>
      ) : (
        <div className="history-groups">
          {(['today', 'yesterday', 'older'] as const).map((bucket) =>
            groups[bucket].length === 0 ? null : (
              <section key={bucket} className="history-group">
                <h3>
                  {bucket === 'today'
                    ? t('history.today')
                    : bucket === 'yesterday'
                      ? t('history.yesterday')
                      : t('history.older')}
                </h3>
                <div className="list">
                  {groups[bucket].map((entry) => (
                    <div key={`${entry.url}-${entry.visitedAt}`} className="list-row">
                      <button
                        type="button"
                        className="list-main"
                        onClick={() => onOpen(entry.url)}
                        title={entry.url}
                      >
                        <span className="list-mark">{initials(entry.title || hostOf(entry.url))}</span>
                        <span className="list-text">
                          <strong>{entry.title || hostOf(entry.url)}</strong>
                          <small>{hostOf(entry.url)}</small>
                        </span>
                        <span className="list-meta">
                          {bucket === 'older' ? formatDate(entry.visitedAt) : formatTime(entry.visitedAt)}
                          <em>
                            {entry.visits} {t('history.visits')}
                          </em>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn row-delete"
                        title={t('history.delete')}
                        onClick={() => void onRemove(entry.url)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </Panel>
  )
}
