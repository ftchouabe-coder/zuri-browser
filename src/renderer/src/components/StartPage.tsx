import { useMemo, useState, type JSX } from 'react'
import type { Bookmark, HistoryEntry, Settings } from '@shared/types'
import type { Translate } from '../i18n'
import { greetingKey, hostOf, initials } from '../utils'
import { Icon } from './Icons'

interface PrivacyState {
  totalBlocked: number
  ready: boolean
  lastUpdate: number
}

interface StartPageProps {
  t: Translate
  settings: Settings
  bookmarks: Bookmark[]
  history: HistoryEntry[]
  privacy: PrivacyState
  onNavigate: (input: string) => void
  onOpen: (url: string) => void
  onOpenPanel: (panel: 'settings' | 'bookmarks' | 'about' | 'history') => void
}

const DISCOVER = [
  {
    title: 'Wikipédia — Afrique',
    url: 'https://fr.wikipedia.org/wiki/Afrique',
    fr: 'Savoir',
    en: 'Knowledge'
  },
  { title: 'Jeune Afrique', url: 'https://www.jeuneafrique.com/', fr: 'Presse', en: 'News' },
  { title: 'RFI Afrique', url: 'https://www.rfi.fr/fr/afrique/', fr: 'Presse', en: 'News' },
  { title: 'BBC Afrique', url: 'https://www.bbc.com/afrique', fr: 'Presse', en: 'News' },
  { title: 'Music In Africa', url: 'https://www.musicinafrica.net/', fr: 'Culture', en: 'Culture' },
  {
    title: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org/#map=3/1.0/20.0',
    fr: 'Cartes',
    en: 'Maps'
  }
]

export function StartPage({
  t,
  settings,
  bookmarks,
  history,
  privacy,
  onNavigate,
  onOpen,
  onOpenPanel
}: StartPageProps): JSX.Element {
  const [query, setQuery] = useState('')
  const french = settings.language === 'fr'

  const shortcuts = useMemo(() => {
    const items: { title: string; url: string }[] = []
    const seen = new Set<string>()
    for (const bookmark of bookmarks) {
      if (items.length >= 6) break
      if (seen.has(bookmark.url)) continue
      seen.add(bookmark.url)
      items.push({ title: bookmark.title || hostOf(bookmark.url), url: bookmark.url })
    }
    const ranked = [...history].sort((a, b) => b.visits - a.visits || b.visitedAt - a.visitedAt)
    for (const entry of ranked) {
      if (items.length >= 6) break
      if (seen.has(entry.url)) continue
      seen.add(entry.url)
      items.push({ title: entry.title || hostOf(entry.url), url: entry.url })
    }
    return items
  }, [bookmarks, history])

  const greeting = french
    ? { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' }[greetingKey()]
    : { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }[
        greetingKey()
      ]

  const today = new Intl.DateTimeFormat(settings.language === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date())

  return (
    <div className="start-page">
      <div className="start-inner">
        <div className="hero">
          <div className="hero-copy">
            <div className="hero-eyebrow">{today}</div>
            <h1>
              {greeting}
              <span className="hero-dot">.</span>
            </h1>
            <p>{t('start.subtitle')}</p>
          </div>
          <div className="hero-orb" aria-hidden="true">
            <span className="orb-ring orb-ring-1" />
            <span className="orb-ring orb-ring-2" />
            <span className="orb-core">Z</span>
          </div>
        </div>

        <form
          className="search-pill"
          onSubmit={(event) => {
            event.preventDefault()
            if (query.trim()) onNavigate(query)
          }}
        >
          <Icon name="search" size={19} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('start.search')}
            aria-label={t('start.search')}
            spellCheck={false}
          />
          <span className="search-engine">{t('start.search')}</span>
        </form>

        <div className="kente-rule" aria-hidden="true" />

        <section className="start-section">
          <div className="section-head">
            <h2>{t('start.quickLinks')}</h2>
            <button type="button" className="link-btn" onClick={() => onOpenPanel('bookmarks')}>
              {t('bookmarks.title')}
            </button>
          </div>

          {shortcuts.length > 0 ? (
            <div className="shortcut-grid">
              {shortcuts.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  className="shortcut"
                  onClick={() => onOpen(item.url)}
                  title={item.url}
                >
                  <span className="shortcut-mark">{initials(item.title)}</span>
                  <span className="shortcut-text">
                    <strong>{item.title}</strong>
                    <small>{hostOf(item.url)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">{t('start.noTopSites')}</p>
          )}
        </section>

        <section className="start-section">
          <div className="section-head">
            <h2>{t('start.discover')}</h2>
            <span className="section-note">{french ? 'Sans traqueur' : 'Tracker-free'}</span>
          </div>
          <div className="discover-grid">
            {DISCOVER.map((item) => (
              <button
                key={item.url}
                type="button"
                className="discover-card"
                onClick={() => onOpen(item.url)}
              >
                <span className="discover-tag">{french ? item.fr : item.en}</span>
                <strong>{item.title}</strong>
                <small>{hostOf(item.url)}</small>
                <span className="discover-arrow">
                  <Icon name="chevronRight" size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="shield-strip">
          <div className="shield-intro">
            <span className="shield-icon">
              <Icon name="shield" size={20} />
            </span>
            <div>
              <h2>{t('start.privacy')}</h2>
              <p className="muted">
                {french
                  ? 'Tout se passe sur cet appareil. Aucune donnée ne quitte Zuri.'
                  : 'Everything happens on this device. No data leaves Zuri.'}
              </p>
            </div>
          </div>
          <div className="shield-stats">
            <button type="button" className="stat" onClick={() => onOpenPanel('about')}>
              <strong>{privacy.totalBlocked}</strong>
              <span>{t('start.blocked')}</span>
            </button>
            <div className="stat">
              <strong className={privacy.ready ? 'ok' : 'pending'}>
                {privacy.ready ? t('start.filtersReady') : t('start.filtersLoading')}
              </strong>
              <span>{t('start.filters')}</span>
            </div>
            <div className="stat">
              <strong>{settings.dns === 'off' ? t('start.dohOff') : t('start.doh')}</strong>
              <span>{t('start.dns')}</span>
            </div>
          </div>
        </section>

        <footer className="start-footer">
          <span>Zuri · {french ? 'navigateur privé' : 'private browser'}</span>
          <button type="button" className="link-btn" onClick={() => onOpenPanel('settings')}>
            {t('menu.settings')}
          </button>
        </footer>
      </div>
    </div>
  )
}
