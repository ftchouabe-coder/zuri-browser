export const TABSTRIP_HEIGHT = 40
export const TOOLBAR_HEIGHT = 50
export const BOOKMARKS_HEIGHT = 30

export function chromeHeightFor(showBookmarksBar: boolean): number {
  return TABSTRIP_HEIGHT + TOOLBAR_HEIGHT + (showBookmarksBar ? BOOKMARKS_HEIGHT : 0)
}
