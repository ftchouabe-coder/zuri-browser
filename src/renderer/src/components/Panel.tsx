import type { JSX, ReactNode } from 'react'
import { Icon } from './Icons'

interface PanelProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  wide?: boolean
}

export function Panel({
  title,
  subtitle,
  onClose,
  children,
  actions,
  wide = false
}: PanelProps): JSX.Element {
  return (
    <section className="panel" aria-label={title}>
      <div className={`panel-inner${wide ? ' is-wide' : ''}`}>
        <header className="panel-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          <div className="panel-head-actions">
            {actions}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>
        {children}
      </div>
    </section>
  )
}
