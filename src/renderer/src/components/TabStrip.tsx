import type { JSX, MouseEvent } from 'react'
import type { TabsSnapshot } from '@shared/types'
import type { Translate } from '../i18n'
import { initials } from '../utils'
import { Icon } from './Icons'

interface TabStripProps {
  snapshot: TabsSnapshot
  t: Translate
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onMute: (id: string, muted: boolean) => void
  onMinimize: () => void
  onToggleMaximize: () => void
  onCloseWindow: () => void
}

export function TabStrip({
  snapshot,
  t,
  onSelect,
  onClose,
  onNew,
  onMute,
  onMinimize,
  onToggleMaximize,
  onCloseWindow
}: TabStripProps): JSX.Element {
  const closeTab = (event: MouseEvent, id: string): void => {
    event.stopPropagation()
    onClose(id)
  }

  return (
    <header
      className="tabstrip"
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('.tab') || target.closest('button')) return
        onToggleMaximize()
      }}
    >
      <div className="brand" title="Zuri">
        <span className="brand-mark">Z</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Onglets">
        {snapshot.tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === snapshot.activeId}
            className={[
              'tab',
              tab.id === snapshot.activeId ? 'is-active' : '',
              tab.isPrivate ? 'is-private' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            title={tab.title}
            onClick={() => onSelect(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) closeTab(event, tab.id)
            }}
          >
            <span className="tab-icon">
              {tab.isPrivate ? (
                <Icon name="eyeOff" size={13} />
              ) : tab.loading ? (
                <span className="spinner" />
              ) : tab.favicon ? (
                <img src={tab.favicon} alt="" referrerPolicy="no-referrer" draggable={false} />
              ) : (
                <span className="tab-letter">{initials(tab.title || tab.url || 'Z')}</span>
              )}
            </span>

            <span className="tab-title">{tab.title || t('tabs.new')}</span>

            {tab.audible && (
              <button
                type="button"
                className="tab-audio"
                title={tab.muted ? t('tabs.unmute') : t('tabs.mute')}
                onClick={(event) => {
                  event.stopPropagation()
                  onMute(tab.id, !tab.muted)
                }}
              >
                <Icon name={tab.muted ? 'mute' : 'volume'} size={13} />
              </button>
            )}

            <button
              type="button"
              className="tab-close"
              title={t('tabs.close')}
              aria-label={t('tabs.close')}
              onClick={(event) => closeTab(event, tab.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}

        <button type="button" className="tab-new" title={t('menu.newTab')} onClick={onNew}>
          <Icon name="plus" size={15} />
        </button>
      </div>

      <div className="window-controls">
        <button type="button" title={t('window.minimize')} onClick={onMinimize}>
          <Icon name="minimize" size={14} />
        </button>
        <button
          type="button"
          title={snapshot.maximized ? t('window.restore') : t('window.maximize')}
          onClick={onToggleMaximize}
        >
          <Icon name={snapshot.maximized ? 'restore' : 'maximize'} size={13} />
        </button>
        <button type="button" className="danger" title={t('window.close')} onClick={onCloseWindow}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  )
}
