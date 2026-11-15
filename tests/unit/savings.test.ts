import { describe, expect, it } from 'vitest'
import { bump, currentMonth, monthKey, normalizeSavings } from '../../src/main/savings-math'

describe('compteur de données économisées', () => {
  it('compte par mois et repart de zéro au mois suivant', () => {
    let state = { month: '2026-11', count: 10 }
    state = bump(state, '2026-11', 5)
    expect(state).toEqual({ month: '2026-11', count: 15 })
    state = bump(state, '2026-12')
    expect(state).toEqual({ month: '2026-12', count: 1 })
    expect(currentMonth(state, '2027-01')).toEqual({ month: '2027-01', count: 0 })
  })

  it('formate le mois', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01')
    expect(monthKey(new Date(2026, 10, 30))).toBe('2026-11')
  })

  it('refuse un fichier altéré', () => {
    expect(normalizeSavings({ month: '2026-11', count: 42.7 })).toEqual({ month: '2026-11', count: 42 })
    expect(normalizeSavings({ month: '../x', count: -3 })).toEqual({ month: '', count: 0 })
    expect(normalizeSavings(null)).toEqual({ month: '', count: 0 })
    expect(normalizeSavings({ count: 'beaucoup' })).toEqual({ month: '', count: 0 })
  })
})
