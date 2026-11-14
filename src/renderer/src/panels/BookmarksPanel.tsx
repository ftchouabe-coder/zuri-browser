import type { JSX } from 'react'
import type { Bookmark } from '@shared/types'
import type { Translate } from '../i18n'
import { Panel } from '../components/Panel'
import { Icon } from '../components/Icons'
import { hostOf, initials } from '../utils'

interface BookmarksPanelProps {
  bookmarks: Bookmark[]
  t: Translate
  onOpen: (url: string) => void
  onRemove: (id: string) => Promise<void>
  onClose: () => void
}

export function BookmarksPanel({
  bookmarks,
  t,
  onOpen,
  onRemove,
  onClose
}: BookmarksPanelProps): JSX.Element {
  return (
    <Panel
      title={t('bookmarks.title')}
      subtitle={`${bookmarks.length} ${bookmarks.length === 1 ? 'favori' : 'favoris'}`}
      onClose={onClose}
      wide
    >
      {bookmarks.length === 0 ? (
        <div className="empty-state">
          <Icon name="bookmark" size={28} />
          <p>{t('bookmarks.empty')}</p>
        </div>
      ) : (
        <div className="bookmarks-grid">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="bookmark-card">
              <button
                type="button"
                className="bookmark-open"
                onClick={() => onOpen(bookmark.url)}
                title={bookmark.url}
              >
                <span className="bookmark-mark">{initials(bookmark.title || hostOf(bookmark.url))}</span>
                <span className="bookmark-text">
                  <strong>{bookmark.title || hostOf(bookmark.url)}</strong>
                  <small>{hostOf(bookmark.url)}</small>
                </span>
              </button>
              <button
                type="button"
                className="icon-btn row-delete"
                title={t('bookmarks.remove')}
                onClick={() => void onRemove(bookmark.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
