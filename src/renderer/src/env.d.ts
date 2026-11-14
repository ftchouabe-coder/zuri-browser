import type { ZuriApi } from '@shared/types'

declare global {
  interface Window {
    zuri: ZuriApi
  }
}

export {}
