import { domainToUnicode } from 'node:url'
import { parse } from 'tldts'

/**
 * Détection locale des faux sites de mobile money et de banque (même logique que la version
 * Android, `Lookalike.kt`). Aucune requête réseau : le nom d'hôte est comparé à une liste de
 * marques et à leurs domaines officiels. Ici, le domaine enregistrable vient de la vraie liste
 * des suffixes publics (tldts).
 */
export interface Brand {
  name: string
  /** Label des domaines officiels, tirets retirés (orange pour orange.cm, orange.sn…). */
  official: readonly string[]
  tokens: readonly string[]
  /** `null` : la marque seule suffit ; sinon l'un de ces mots-clés est aussi exigé. */
  keywords: readonly string[] | null
  example: string
}

export interface LookalikeMatch {
  brand: Brand
  host: string
}

const MONEY = ['money', 'momo', 'pay', 'cash', 'wallet', 'transfert', 'transfer', 'mobilemoney']
const ACCOUNT = [
  ...MONEY,
  'bank', 'banque', 'secure', 'securite', 'login', 'signin', 'connexion', 'verif', 'compte', 'account',
  'bonus', 'promo', 'gagn', 'cadeau', 'gift', 'recharge', 'credit', 'support', 'client', 'update', 'miseajour'
]

const ORANGE = 'orange.cm, orange.sn, orange.ci…'
const MTN = 'mtn.cm, mtn.com.gh, mtn.co.ug…'
const MOOV = 'moov-africa.ci, moov-africa.bj…'
const AIRTEL = 'airtel.africa, airtel.co.ke…'

export const BRANDS: readonly Brand[] = [
  { name: 'Orange Money', official: ['orange', 'orangemoney'], tokens: ['orangemoney'], keywords: null, example: ORANGE },
  { name: 'Orange Money', official: ['orange', 'orangemoney'], tokens: ['orange'], keywords: ACCOUNT, example: ORANGE },
  { name: 'MTN MoMo', official: ['mtn', 'mtnonline'], tokens: ['mtnmomo', 'momomtn'], keywords: null, example: MTN },
  { name: 'MTN MoMo', official: ['mtn', 'mtnonline'], tokens: ['mtn'], keywords: ACCOUNT, example: MTN },
  { name: 'Wave', official: ['wave'], tokens: ['wave'], keywords: MONEY, example: 'wave.com' },
  { name: 'Moov Money', official: ['moov', 'moovafrica'], tokens: ['moovmoney', 'moovafrica'], keywords: null, example: MOOV },
  { name: 'Moov Money', official: ['moov', 'moovafrica'], tokens: ['moov'], keywords: MONEY, example: MOOV },
  { name: 'Airtel Money', official: ['airtel', 'airtelafrica'], tokens: ['airtelmoney'], keywords: null, example: AIRTEL },
  { name: 'Airtel Money', official: ['airtel', 'airtelafrica'], tokens: ['airtel'], keywords: ACCOUNT, example: AIRTEL },
  { name: 'M-Pesa', official: ['safaricom', 'vodacom', 'vodafone', 'mpesa'], tokens: ['mpesa'], keywords: null, example: 'safaricom.co.ke, vodacom.co.tz…' },
  { name: 'Ecobank', official: ['ecobank'], tokens: ['ecobank'], keywords: null, example: 'ecobank.com' },
  { name: 'Afriland First Bank', official: ['afrilandfirstbank', 'afriland'], tokens: ['afriland'], keywords: null, example: 'afrilandfirstbank.com' },
  { name: 'Express Union', official: ['expressunion'], tokens: ['expressunion'], keywords: null, example: 'expressunion.net' },
  { name: 'Western Union', official: ['westernunion', 'wu'], tokens: ['westernunion'], keywords: null, example: 'westernunion.com' },
  { name: 'MoneyGram', official: ['moneygram'], tokens: ['moneygram'], keywords: null, example: 'moneygram.com' },
  { name: 'Wizall Money', official: ['wizall'], tokens: ['wizall'], keywords: null, example: 'wizall.com' },
  { name: 'PayPal', official: ['paypal', 'paypalobjects'], tokens: ['paypal'], keywords: null, example: 'paypal.com' }
]

/** Caractères qui ressemblent à des lettres latines (cyrillique, grec, chiffres, accents). */
const CONFUSABLES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j', ԁ: 'd', ӏ: 'l', ɡ: 'g', ո: 'n', ս: 'u', ѕ: 's', һ: 'h',
  ο: 'o', α: 'a', ν: 'v', ρ: 'p', ι: 'i', κ: 'k', τ: 't', ε: 'e',
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a',
  à: 'a', á: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ï: 'i', î: 'i', ó: 'o', ô: 'o', ö: 'o', ú: 'u', ü: 'u', ç: 'c'
}

export function skeleton(value: string): string {
  let out = ''
  for (const c of value.toLowerCase()) {
    const m = CONFUSABLES[c] ?? c
    if (/^[a-z0-9]$/.test(m)) out += m
  }
  return out.replace(/rn/g, 'm').replace(/vv/g, 'w')
}

export function checkLookalike(rawHost: string): LookalikeMatch | null {
  const ascii = rawHost.toLowerCase().replace(/\.$/, '')
  if (!ascii || /^[\d.:[\]]+$/.test(ascii)) return null
  const host = domainToUnicode(ascii) || ascii
  const info = parse(ascii, { allowPrivateDomains: false })
  if (!info.domain || !info.domainWithoutSuffix) return null
  const registrable = (domainToUnicode(info.domainWithoutSuffix) || info.domainWithoutSuffix).replace(/-/g, '')
  const withoutSuffix = info.subdomain ? `${info.subdomain}.${info.domainWithoutSuffix}` : info.domainWithoutSuffix
  const text = skeleton(domainToUnicode(withoutSuffix) || withoutSuffix)
  for (const brand of BRANDS) {
    // Domaine officiel exact (sans normalisation : « 0range » n'est pas « orange »).
    if (brand.official.includes(registrable)) continue
    const tokens = brand.tokens.map(skeleton)
    if (!tokens.some((t) => text.includes(t))) continue
    const keywords = brand.keywords?.map(skeleton)
    if (keywords && !keywords.some((k) => text.includes(k) && !tokens.includes(k))) continue
    return { brand, host }
  }
  return null
}
