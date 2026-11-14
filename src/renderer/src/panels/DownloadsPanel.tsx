import type { JSX } from 'react'
import type { DownloadItem } from '@shared/types'
import type { Translate } from '../i18n'
import { Panel } from '../components/Panel'
import { Icon } from '../components/Icons'
import { formatBytes, formatTime, hostOf } from '../utils'

interface DownloadsPanelProps {
  downloads: DownloadItem[]
  t: Translate
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
  onOpen: (id: string) => void
  onShow: (id: string) => void
  onClose: () => void
}

function stateLabel(item: DownloadItem, t: Translate): string {
  switch (item.state) {
    case 'completed':
      return t('downloads.completed')
    case 'cancelled':
      return t('downloads.cancelled')
    case 'interrupted':
      return t('downloads.interrupted')
    default:
      return t('downloads.inProgress')
  }
}

export function DownloadsPanel({
  downloads,
  t,
  onPause,
  onResume,
  onCancel,
  onOpen,
  onShow,
  onClose
}: DownloadsPanelProps): JSX.Element {
  return (
    <Panel
      title={t('downloads.title')}
      subtitle={`${downloads.length}`}
      onClose={onClose}
      wide
    >
      {downloads.length === 0 ? (
        <div className="empty-state">
          <Icon name="download" size={28} />
          <p>{t('downloads.empty')}</p>
        </div>
      ) : (
        <div className="downloads-list">
          {downloads.map((item) => {
            const percent =
              item.total > 0 ? Math.min(100, Math.round((item.received / item.total) * 100)) : 0
            const done = item.state === 'completed'
            const active = item.state === 'progressing'
            return (
              <div key={item.id} className="download-row">
                <span className={`download-state ${item.state}`}>
                  <Icon name={done ? 'check' : active ? 'download' : 'alert'} size={16} />
                </span>

                <div className="download-main">
                  <div className="download-title">
                    <strong>{item.filename}</strong>
                    {item.isPrivate && <span className="pill">{t('tabs.private')}</span>}
                  </div>
                  <div className="download-sub">
                    <span>{hostOf(item.url)}</span>
                    <span>·</span>
                    <span>{stateLabel(item, t)}</span>
                    <span>·</span>
                    <span>
                      {formatBytes(item.received)}
                      {item.total > 0 ? ` / ${formatBytes(item.total)}` : ''}
                    </span>
                    <span>·</span>
                    <span>{formatTime(item.startedAt)}</span>
                  </div>
                  {active && (
                    <div className="progress">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  )}
                </div>

                <div className="download-actions">
                  {active && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        title={item.paused ? t('downloads.resume') : t('downloads.pause')}
                        onClick={() => (item.paused ? onResume(item.id) : onPause(item.id))}
                      >
                        <Icon name={item.paused ? 'play' : 'pause'} size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('downloads.cancel')}
                        onClick={() => onCancel(item.id)}
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </>
                  )}
                  {done && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('downloads.open')}
                        onClick={() => onOpen(item.id)}
                      >
                        <Icon name="external" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('downloads.folder')}
                        onClick={() => onShow(item.id)}
                      >
                        <Icon name="folder" size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
