import { JsonStore } from './store'
import { AVERAGE_BLOCKED_BYTES, bump, currentMonth, monthKey, normalizeSavings, type SavingsState } from './savings-math'

// Un simple compteur (pas d'adresse) : inutile de le chiffrer. Écriture différée par JsonStore.
const store = new JsonStore<SavingsState>('savings.json', { month: '', count: 0 }, normalizeSavings)

export function recordBlocked(n = 1): void {
  store.update((state) => bump(state, monthKey(), n))
}

export function savingsThisMonth(): { count: number; bytes: number } {
  const { count } = currentMonth(store.get(), monthKey())
  return { count, bytes: count * AVERAGE_BLOCKED_BYTES }
}
