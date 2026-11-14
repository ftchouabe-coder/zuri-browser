import type { JSX, SVGProps } from 'react'

export type IconName =
  | 'back'
  | 'forward'
  | 'reload'
  | 'close'
  | 'plus'
  | 'shield'
  | 'star'
  | 'starFilled'
  | 'menu'
  | 'download'
  | 'history'
  | 'bookmark'
  | 'search'
  | 'settings'
  | 'lock'
  | 'unlock'
  | 'globe'
  | 'alert'
  | 'volume'
  | 'mute'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'trash'
  | 'folder'
  | 'pause'
  | 'play'
  | 'external'
  | 'check'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'info'
  | 'eyeOff'
  | 'zap'
  | 'wifiOff'
  | 'globe2'

const paths: Record<IconName, JSX.Element> = {
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  reload: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6" />
      <path d="M20 4v7h-7" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z" />
      <path d="M9.5 12.2l1.8 1.8 3.5-3.8" />
    </>
  ),
  star: <path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 4z" />,
  starFilled: (
    <path
      d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 4z"
      fill="currentColor"
      stroke="none"
    />
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
  bookmark: <path d="M7 4h10v16l-5-3.6L7 20V4z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-.9 1.4V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.4-.9H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 .9-1.4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .9 1.4 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.4.9H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.9z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 6.8-1.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.4 3.3 5.1 3.3 8S14.2 17.6 12 20c-2.2-2.4-3.3-5.1-3.3-8S9.8 6.4 12 4z" />
    </>
  ),
  globe2: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 9.5h16M4 14.5h16" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5l8.5 15h-17L12 4.5z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  volume: (
    <>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4z" />
      <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  mute: (
    <>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4z" />
      <path d="M15 10l4 4M19 10l-4 4" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M14 6l-6 6 6 6" />,
  chevronRight: <path d="M10 6l6 6-6 6" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
  restore: (
    <>
      <rect x="4.5" y="8" width="11" height="11" rx="1.5" />
      <path d="M8 8V5.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M10 4h4M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7.5z" />
    </>
  ),
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  play: <path d="M8 5l11 7-11 7V5z" />,
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18V7a1.5 1.5 0 0 1 1.5-1.5H9" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2" />
      <path d="M6.2 6.8C4.4 8.2 3.2 10 2.5 12c1.6 4 5.1 6.5 9.5 6.5 1.6 0 3.1-.4 4.4-1.1M17.5 17.1c1.7-1.3 3-3 3.7-5.1-1.6-4-5.1-6.5-9.2-6.5-.9 0-1.8.1-2.6.4" />
    </>
  ),
  zap: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
  wifiOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M8.5 13.5a6 6 0 0 1 7 0M5.5 10.2a11 11 0 0 1 3-1.7M12 18.5v.1" />
    </>
  )
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}
