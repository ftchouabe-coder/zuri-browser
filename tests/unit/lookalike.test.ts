import { describe, expect, it } from 'vitest'
import { checkLookalike, skeleton } from '../../src/main/lookalike'

const brand = (host: string): string | undefined => checkLookalike(host)?.brand.name

describe('faux sites de mobile money et de banque', () => {
  it('signale les imitations', () => {
    expect(brand('orange-money-bonus.xyz')).toBe('Orange Money')
    expect(brand('orangemoney-cm.com')).toBe('Orange Money')
    expect(brand('0range-money.com')).toBe('Orange Money')
    expect(brand('orange.secure-login.top')).toBe('Orange Money')
    expect(brand('orange-money-cm.blogspot.com')).toBe('Orange Money')
    expect(brand('mtn-momo-promo.top')).toBe('MTN MoMo')
    expect(brand('mtn-rnomo.top')).toBe('MTN MoMo')
    expect(brand('wave-money-senegal.com')).toBe('Wave')
    expect(brand('m-pesa-reversal.co.ke')).toBe('M-Pesa')
    expect(brand('ecobank-online-verify.com')).toBe('Ecobank')
    expect(brand('paypa1.com')).toBe('PayPal')
    expect(brand('xn--pypal-4ve.com')).toBe('PayPal') // « pаypal » avec un « а » cyrillique
    expect(brand('westernunion-transfert.net')).toBe('Western Union')
  })

  it('laisse passer les sites officiels', () => {
    for (const host of [
      'orange.cm', 'www.orange.sn', 'selfcare.orange.ci', 'mtn.cm', 'www.mtn.com.gh', 'wave.com',
      'safaricom.co.ke', 'ecobank.com', 'www.paypal.com', 'www.westernunion.com', 'moneygram.com',
      'airtel.co.ke', 'moov-africa.ci', 'orange.co.ke'
    ]) {
      expect(checkLookalike(host), host).toBeNull()
    }
  })

  it('évite les fausses alertes', () => {
    for (const host of [
      'orangecounty.gov', 'orange-juice-recipes.com', 'microwave.com', 'wave-surf.com',
      'mtnbikes.com', 'jeuneafrique.com', 'jumia.com.ng', '192.168.1.1', 'localhost', 'lemoovement.org'
    ]) {
      expect(checkLookalike(host), host).toBeNull()
    }
  })

  it('neutralise les caractères trompeurs', () => {
    expect(skeleton('0range-m0ney')).toBe('orangemoney')
    expect(skeleton('pаypal')).toBe('paypal')
  })
})
