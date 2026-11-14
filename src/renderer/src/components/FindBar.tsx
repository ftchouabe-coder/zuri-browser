import { useEffect, useRef, useState, type JSX } from 'react'
import type { Translate } from '../i18n'
import { Icon } from './Icons'

interface FindBarProps {
  t: Translate
  matches: number
  active: number
  onFind: (text: string, forward: boolean, findNext: boolean) => void
  onClose: () => void
}

export function FindBar({ t, matches, active, onFind, onClose }: FindBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      onFind(text, true, false)
    }, 160)
    return () => clearTimeout(timer)
  }, [text, onFind])

  return (
    <div className="find-bar">
      <div className="find-field">
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          value={text}
          placeholder={t('find.placeholder')}
          aria-label={t('find.placeholder')}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onFind(text, !event.shiftKey, true)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
        <span className={`find-count${matches === 0 && text ? ' is-empty' : ''}`}>
          {text ? (matches === 0 ? t('find.noResults') : `${active}/${matches}`) : ''}
        </span>
      </div>
      <div className="find-actions">
        <button
          type="button"
          className="icon-btn"
          title={t('find.prev')}
          onClick={() => onFind(text, false, true)}
        >
          <Icon name="chevronLeft" size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('find.next')}
          onClick={() => onFind(text, true, true)}
        >
          <Icon name="chevronRight" size={15} />
        </button>
        <button type="button" className="icon-btn" title={t('find.close')} onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )
}
