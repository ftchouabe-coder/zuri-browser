import type { JSX, ReactNode } from 'react'
import {
  DNS_PROVIDERS,
  SEARCH_ENGINES,
  type AppInfo,
  type Language,
  type Settings,
  type ThemeMode
} from '@shared/types'
import type { Translate } from '../i18n'
import { Switch } from '../components/Switch'
import { Panel } from '../components/Panel'
import { Icon } from '../components/Icons'

interface SettingsPanelProps {
  settings: Settings
  info: AppInfo | null
  privacy: { totalBlocked: number; ready: boolean; lastUpdate: number }
  t: Translate
  onChange: (patch: Partial<Settings>) => Promise<void>
  onClear: (scope: 'all' | 'history' | 'cookies') => Promise<void>
  onClose: () => void
}

function Row({
  title,
  description,
  control
}: {
  title: string
  description?: string
  control: ReactNode
}): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <span className="setting-title">{title}</span>
        {description && <p>{description}</p>}
      </div>
      <div className="setting-control">{control}</div>
    </div>
  )
}

export function SettingsPanel({
  settings,
  info,
  privacy,
  t,
  onChange,
  onClear,
  onClose
}: SettingsPanelProps): JSX.Element {
  const themeOptions: { id: ThemeMode; label: string }[] = [
    { id: 'light', label: t('theme.light') },
    { id: 'dark', label: t('theme.dark') },
    { id: 'system', label: t('theme.system') }
  ]

  return (
    <Panel
      title={t('settings.title')}
      subtitle={t('settings.saved')}
      onClose={onClose}
      wide
    >
      <div className="settings-layout">
        <section className="settings-card">
          <h2>
            <Icon name="sun" size={16} /> {t('settings.appearance')}
          </h2>

          <Row
            title={t('settings.theme')}
            control={
              <div className="segmented">
                {themeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={settings.theme === option.id ? 'is-on' : ''}
                    onClick={() => void onChange({ theme: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />

          <Row
            title={t('settings.language')}
            control={
              <select
                value={settings.language}
                onChange={(event) => void onChange({ language: event.target.value as Language })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            }
          />

          <Row
            title={t('settings.bookmarksBar')}
            control={
              <Switch
                checked={settings.showBookmarksBar}
                label={t('settings.bookmarksBar')}
                onChange={(checked) => void onChange({ showBookmarksBar: checked })}
              />
            }
          />
        </section>

        <section className="settings-card">
          <h2>
            <Icon name="search" size={16} /> {t('settings.search')}
          </h2>
          <Row
            title={t('settings.searchEngine')}
            description={t('omni.searchDuck')}
            control={
              <select
                value={settings.searchEngine}
                onChange={(event) =>
                  void onChange({ searchEngine: event.target.value as Settings['searchEngine'] })
                }
              >
                {SEARCH_ENGINES.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            }
          />
        </section>

        <section className="settings-card">
          <h2>
            <Icon name="shield" size={16} /> {t('settings.privacy')}
          </h2>

          <Row
            title={t('settings.adblock')}
            description={t('settings.adblockDesc')}
            control={
              <Switch
                checked={settings.adblock}
                label={t('settings.adblock')}
                onChange={(checked) => void onChange({ adblock: checked })}
              />
            }
          />

          <Row
            title={t('settings.cosmetic')}
            description={t('settings.cosmeticDesc')}
            control={
              <Switch
                checked={settings.cosmeticFilters}
                label={t('settings.cosmetic')}
                onChange={(checked) => void onChange({ cosmeticFilters: checked })}
              />
            }
          />

          <Row
            title={t('settings.httpsOnly')}
            description={t('settings.httpsOnlyDesc')}
            control={
              <Switch
                checked={settings.httpsOnly}
                label={t('settings.httpsOnly')}
                onChange={(checked) => void onChange({ httpsOnly: checked })}
              />
            }
          />

          <Row
            title={t('settings.thirdPartyCookies')}
            description={t('settings.thirdPartyCookiesDesc')}
            control={
              <Switch
                checked={settings.blockThirdPartyCookies}
                label={t('settings.thirdPartyCookies')}
                onChange={(checked) => void onChange({ blockThirdPartyCookies: checked })}
              />
            }
          />

          <Row
            title={t('settings.referrer')}
            description={t('settings.referrerDesc')}
            control={
              <Switch
                checked={settings.stripReferrer}
                label={t('settings.referrer')}
                onChange={(checked) => void onChange({ stripReferrer: checked })}
              />
            }
          />

          <Row
            title={t('settings.dns')}
            description={t('settings.dnsDesc')}
            control={
              <select
                value={settings.dns}
                onChange={(event) =>
                  void onChange({ dns: event.target.value as Settings['dns'] })
                }
              >
                {DNS_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            }
          />
        </section>

        <section className="settings-card">
          <h2>
            <Icon name="zap" size={16} /> {t('settings.data')}
          </h2>

          <Row
            title={t('settings.dataSaver')}
            description={t('settings.dataSaverDesc')}
            control={
              <Switch
                checked={settings.dataSaver}
                label={t('settings.dataSaver')}
                onChange={(checked) => void onChange({ dataSaver: checked })}
              />
            }
          />

          <Row
            title={t('settings.autoplay')}
            description={t('settings.autoplayDesc')}
            control={
              <Switch
                checked={settings.autoplay}
                label={t('settings.autoplay')}
                onChange={(checked) => void onChange({ autoplay: checked })}
              />
            }
          />

          <Row
            title={t('settings.restoreSession')}
            control={
              <Switch
                checked={settings.restoreSession}
                label={t('settings.restoreSession')}
                onChange={(checked) => void onChange({ restoreSession: checked })}
              />
            }
          />

          <Row
            title={t('settings.clearOnExit')}
            description={t('settings.clearOnExitDesc')}
            control={
              <Switch
                checked={settings.clearOnExit}
                label={t('settings.clearOnExit')}
                onChange={(checked) => void onChange({ clearOnExit: checked })}
              />
            }
          />

          <div className="danger-zone">
            <button type="button" className="btn ghost" onClick={() => void onClear('history')}>
              {t('settings.clearHistory')}
            </button>
            <button type="button" className="btn ghost" onClick={() => void onClear('cookies')}>
              {t('settings.clearCookies')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (window.confirm(`${t('settings.clearAll')} ?`)) void onClear('all')
              }}
            >
              {t('settings.clearAll')}
            </button>
          </div>
        </section>

        <section className="settings-card meta-card">
          <h2>
            <Icon name="info" size={16} /> {t('settings.about')}
          </h2>
          <div className="meta-grid">
            <div>
              <span className="meta-label">{t('about.version')}</span>
              <span className="meta-value">Zuri {info?.version ?? '0.1.0'}</span>
            </div>
            <div>
              <span className="meta-label">Chromium</span>
              <span className="meta-value">{info?.chrome ?? '—'}</span>
            </div>
            <div>
              <span className="meta-label">Electron</span>
              <span className="meta-value">{info?.electron ?? '—'}</span>
            </div>
            <div>
              <span className="meta-label">{t('start.blocked')}</span>
              <span className="meta-value">{privacy.totalBlocked}</span>
            </div>
          </div>

          <Row
            title={t('settings.autoUpdate')}
            description={t('settings.autoUpdateDesc')}
            control={
              <Switch
                checked={settings.autoUpdate}
                label={t('settings.autoUpdate')}
                onChange={(checked) => void onChange({ autoUpdate: checked })}
              />
            }
          />
        </section>
      </div>
    </Panel>
  )
}
