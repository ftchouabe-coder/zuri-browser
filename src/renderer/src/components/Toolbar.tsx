import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Bookmark, HistoryEntry, Settings, TabState } from '@shared/types'
import type { Translate } from '../i18n'
import { isHttps, prettyUrl } from '../utils'
import { Icon } from './Icons'

interface ToolbarProps {
  tab: TabState | null
  settings: Settings
  bookmarks: Bookmark[]
  history: HistoryEntry[]
  t: Translate
  focusSignal: number
  activeDownloads: number
  onNavigate: (input: string) => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onHome: () => void
  onToggleBookmark: () => void
  onOpenPanel: (panel: 'settings' | 'bookmarks' | 'history' | 'downloads' | 'about') => void
  onOpenMenu: (x: number, y: number) => void
  onOpenDownloads: () => void
}

export function Toolbar({
  tab,
  settings,
  bookmarks,
  history,
  t,
  focusSignal,
  activeDownloads,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
  onHome,
  onToggleBookmark,
  onOpenPanel,
  onOpenMenu,
  onOpenDownloads
}: ToolbarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(-1)
  const dragRef = useRef(false)

  const rawUrl = tab?.url ?? ''
  const bookmarked = Boolean(rawUrl) && bookmarks.some((item) => item.url === rawUrl)
  const secure = isHttps(rawUrl)
  const internal = Boolean(tab?.isNewTab) || !rawUrl

  useEffect(() => {
    if (editing) return
    setValue(internal ? '' : prettyUrl(rawUrl))
  }, [rawUrl, internal, editing])

  useEffect(() => {
    if (focusSignal === 0) return
    const input = inputRef.current
    if (!input) return
    setEditing(true)
    setValue(rawUrl)
    setCursor(-1)
    input.focus()
    input.select()
  }, [focusSignal, rawUrl])

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase()
    if (!needle || needle === prettyUrl(rawUrl).toLowerCase()) return []
    return history
      .filter(
        (entry) =>
          entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle)
      )
      .slice(0, 6)
  }, [history, value, rawUrl])

  const commit = (input: string): void => {
    const target = input.trim()
    if (!target) return
    setEditing(false)
    setCursor(-1)
    inputRef.current?.blur()
    onNavigate(target)
  }

  const navigateSuggestion = (direction: 1 | -1): void => {
    if (!matches.length) return
    const next =
      cursor === -1
        ? direction === 1
          ? 0
          : matches.length - 1
        : (cursor + direction + matches.length) % matches.length
    setCursor(next)
    const entry = matches[next]
    setValue(entry.url)
    const input = inputRef.current
    if (input) {
      requestAnimationFrame(() => input.setSelectionRange(entry.url.length, entry.url.length))
    }
  }

  return (
    <div className="toolbar">
      <div className="nav-group">
        <button
          type="button"
          className="icon-btn"
          title={t('nav.back')}
          disabled={!tab?.canGoBack}
          onClick={onBack}
        >
          <Icon name="back" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('nav.forward')}
          disabled={!tab?.canGoForward}
          onClick={onForward}
        >
          <Icon name="forward" />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={tab?.loading ? t('nav.stop') : t('nav.reload')}
          onClick={tab?.loading ? onStop : onReload}
        >
          <Icon name={tab?.loading ? 'close' : 'reload'} size={17} />
        </button>
        <button type="button" className="icon-btn home" title={t('nav.home')} onClick={onHome}>
          <Icon name="globe2" size={17} />
        </button>
      </div>

      <div className={`omnibox${editing ? ' is-editing' : ''}`}>
        <span
          className={`security${secure ? ' is-secure' : internal ? ' is-neutral' : ' is-warning'}`}
          title={
            internal
              ? t('omni.internal')
              : secure
                ? t('omni.secure')
                : t('omni.insecure')
          }
        >
          <Icon name={internal ? 'globe' : secure ? 'lock' : 'alert'} size={13} />
        </span>

        <span
          className={`shield-badge${settings.adblock ? '' : ' is-off'}`}
          title={
            settings.adblock
              ? `${tab?.blocked ?? 0} ${t('shield.count')} — ${t('shield.title')}`
              : t('shield.off')
          }
        >
          <Icon name="shield" size={14} />
          {(tab?.blocked ?? 0) > 0 && <span className="shield-count">{tab?.blocked}</span>}
        </span>

        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('omni.placeholder')}
          placeholder={t('omni.placeholder')}
          onChange={(event) => {
            setValue(event.target.value)
            setCursor(-1)
          }}
          onFocus={(event) => {
            setEditing(true)
            setValue(rawUrl)
            setCursor(-1)
            requestAnimationFrame(() => event.target.select())
          }}
          onBlur={() => {
            if (dragRef.current) return
            setEditing(false)
            setValue(internal ? '' : prettyUrl(rawUrl))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(value)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
              setValue(internal ? '' : prettyUrl(rawUrl))
              inputRef.current?.blur()
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              navigateSuggestion(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              navigateSuggestion(-1)
            }
          }}
        />

        {!internal && (
          <>
            <button
              type="button"
              className={`icon-btn subtle star${bookmarked ? ' is-on' : ''}`}
              title={bookmarked ? t('omni.bookmarked') : t('omni.bookmark')}
              onMouseDown={() => {
                dragRef.current = true
              }}
              onMouseUp={() => {
                dragRef.current = false
              }}
              onClick={onToggleBookmark}
            >
              <Icon name={bookmarked ? 'starFilled' : 'star'} size={15} />
            </button>
            <span className="omni-separator" />
            <button
              type="button"
              className="icon-btn subtle"
              title={t('menu.about')}
              onClick={() => onOpenPanel('about')}
            >
              <Icon name="info" size={15} />
            </button>
          </>
        )}
      </div>

      <div className="tool-group">
        <button
          type="button"
          className="icon-btn"
          title={t('menu.downloads')}
          onClick={onOpenDownloads}
        >
          <Icon name="download" size={17} />
          {activeDownloads > 0 && <span className="dot-badge">{activeDownloads}</span>}
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('menu.settings')}
          onClick={() => onOpenPanel('settings')}
        >
          <Icon name="settings" size={17} />
        </button>
        <button
          type="button"
          className="icon-btn menu-btn"
          title={t('app.name')}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onOpenMenu(rect.right - 268, rect.bottom + 8)
          }}
        >
          <Icon name="menu" size={18} />
        </button>
      </div>
    </div>
  )
}
