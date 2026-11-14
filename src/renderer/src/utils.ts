export function prettyUrl(raw: string): string {
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol === 'zuri:') return raw
    const path = `${url.pathname}${url.search}${url.hash}`
    const clean = path === '/' ? '' : path
    return `${url.hostname.replace(/^www\./, '')}${clean}`
  } catch {
    return raw
  }
}

export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return raw
  }
}

export function isHttps(raw: string): boolean {
  return raw.startsWith('https://')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(timestamp)
  )
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(timestamp)
  )
}

export function dayBucket(timestamp: number): 'today' | 'yesterday' | 'older' {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(date, today)) return 'today'
  if (sameDay(date, yesterday)) return 'yesterday'
  return 'older'
}

export function initials(text: string): string {
  const clean = text.replace(/^www\./, '').trim()
  return (clean[0] ?? '?').toUpperCase()
}

export function greetingKey(hour = new Date().getHours()): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
