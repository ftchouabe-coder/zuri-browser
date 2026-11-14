import type { JSX } from 'react'
import { DNS_PROVIDERS, SEARCH_ENGINES, type AppInfo, type Settings } from '@shared/types'
import type { Translate } from '../i18n'
import { Panel } from '../components/Panel'
import { formatDate } from '../utils'

interface AboutPanelProps {
  info: AppInfo | null
  settings: Settings
  privacy: { totalBlocked: number; ready: boolean; lastUpdate: number }
  t: Translate
  onClose: () => void
}

export function AboutPanel({ info, settings, privacy, t, onClose }: AboutPanelProps): JSX.Element {
  const engine = SEARCH_ENGINES.find((item) => item.id === settings.searchEngine)?.name ?? '—'
  const dns = DNS_PROVIDERS.find((item) => item.id === settings.dns)?.name ?? '—'

  return (
    <Panel title={t('about.title')} onClose={onClose}>
      <div className="about-hero">
        <span className="about-mark">Z</span>
        <div>
          <h2>Zuri</h2>
          <p className="muted">
            {t('about.version')} {info?.version ?? '0.1.0'} · Chromium {info?.chrome ?? '—'}
          </p>
        </div>
      </div>

      <section className="about-section">
        <h3>{t('about.privacyTitle')}</h3>
        <ul className="check-list">
          <li>{t('about.privacy1')}</li>
          <li>{t('about.privacy2')}</li>
          <li>{t('about.privacy3')}</li>
          <li>{t('about.privacy4')}</li>
        </ul>
      </section>

      <section className="about-section">
        <h3>{t('about.filters')}</h3>
        <div className="about-grid">
          <div>
            <span className="meta-label">{t('start.filters')}</span>
            <span className={`meta-value ${privacy.ready ? 'ok' : 'pending'}`}>
              {privacy.ready ? t('about.filtersReady') : t('about.filtersPending')}
            </span>
          </div>
          <div>
            <span className="meta-label">{t('start.blocked')}</span>
            <span className="meta-value">{privacy.totalBlocked}</span>
          </div>
          <div>
            <span className="meta-label">{t('settings.dns')}</span>
            <span className="meta-value">{dns}</span>
          </div>
          <div>
            <span className="meta-label">{t('settings.searchEngine')}</span>
            <span className="meta-value">{engine}</span>
          </div>
          <div>
            <span className="meta-label">{t('about.version')} Electron</span>
            <span className="meta-value">{info?.electron ?? '—'}</span>
          </div>
          <div>
            <span className="meta-label">{t('start.filters')}</span>
            <span className="meta-value">
              {privacy.lastUpdate ? formatDate(privacy.lastUpdate) : '—'}
            </span>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h3>{t('about.licenses')}</h3>
        <p className="muted small">{t('about.licensesText')}</p>
      </section>

      <p className="about-footnote">
        {settings.language === 'fr'
          ? 'Zuri est un projet open source (licence MIT). Les listes de filtres sont mises à jour depuis leurs sources publiques, sans identifiant.'
          : 'Zuri is an open source project (MIT). Filter lists are updated from their public sources, without identifiers.'}
      </p>
    </Panel>
  )
}
