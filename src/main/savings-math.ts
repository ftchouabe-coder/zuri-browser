/**
 * Compteur mensuel des éléments bloqués et estimation des données économisées (même règle que
 * la version Android). Aucune adresse n'est conservée : seulement un mois et un nombre.
 */
export interface SavingsState {
  month: string
  count: number
}

/**
 * Taille moyenne retenue pour un élément bloqué. Volontairement prudente : un script de
 * publicité pèse souvent 30 à 100 Ko, un pixel de suivi moins de 1 Ko, et les chargements en
 * cascade évités ne sont pas comptés.
 */
export const AVERAGE_BLOCKED_BYTES = 15 * 1024

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function bump(state: SavingsState, month: string, n = 1): SavingsState {
  return state.month === month ? { month, count: state.count + n } : { month, count: n }
}

export function currentMonth(state: SavingsState, month: string): SavingsState {
  return state.month === month ? state : { month, count: 0 }
}

export function normalizeSavings(raw: unknown): SavingsState {
  const value = (raw ?? {}) as Partial<SavingsState>
  const month = typeof value.month === 'string' && /^\d{4}-\d{2}$/.test(value.month) ? value.month : ''
  const count = typeof value.count === 'number' && Number.isFinite(value.count) && value.count > 0 ? Math.floor(value.count) : 0
  return { month, count }
}
