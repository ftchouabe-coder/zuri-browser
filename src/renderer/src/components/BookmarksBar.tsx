import type { JSX } from 'react'
import type { Bookmark } from '@shared/types'
import type { Translate } from '../i18n'
import { hostOf, initials } from '../utils'
import { Icon } from './Icons'

interface BookmarksBarProps {
  bookmarks: Bookmark[]
  t: Translate
  onOpen: (url: string) => void
  onOpenAll: (panel: 'bookmarks') => void
}

export function BookmarksBar({ bookmarks, t, onOpen, onOpenAll }: BookmarksBarProps): JSX.Element {
  return (
    <div className="bookmarks-bar">
      <div className="bookmarks-scroll">
        {bookmarks.slice(0, 24).map((bookmark) => (
          <button
            key={bookmark.id}
            type="button"
            className="bookmark-chip"
            title={`${bookmark.title}\n${bookmark.url}`}
            onClick={() => onOpen(bookmark.url)}
          >
            <span className="chip-mark">{initials(bookmark.title || hostOf(bookmark.url))}</span>
            <span className="chip-label">{bookmark.title || hostOf(bookmark.url)}</span>
          </button>
        ))}
        {bookmarks.length === 0 && (
          <span className="bookmarks-hint">{t('start.emptyBookmarks')}</span>
        )}
      </div>
      <button
        type="button"
        className="bookmarks-manage"
        title={t('bookmarks.title')}
        onClick={() => onOpenAll('bookmarks')}
      >
        <Icon name="chevronRight" size={14} />
      </button>
    </div>
  )
}
