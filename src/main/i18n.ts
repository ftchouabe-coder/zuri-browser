import type { Language } from '@shared/types'
import { getSettings } from './settings'

/** Chaînes affichées par le processus principal (menus contextuels, titres par défaut). */
const STRINGS = {
  fr: {
    'tab.new': 'Nouvel onglet',
    'ctx.openLinkTab': 'Ouvrir le lien dans un nouvel onglet',
    'ctx.openLinkPrivate': 'Ouvrir le lien dans un onglet privé',
    'ctx.copyLink': 'Copier l’adresse du lien',
    'ctx.saveLink': 'Enregistrer le lien sous…',
    'ctx.openImage': 'Ouvrir l’image dans un nouvel onglet',
    'ctx.saveImage': 'Enregistrer l’image sous…',
    'ctx.copyImageUrl': 'Copier l’adresse de l’image',
    'ctx.copy': 'Copier',
    'ctx.search': 'Rechercher « {q} »',
    'ctx.undo': 'Annuler',
    'ctx.redo': 'Rétablir',
    'ctx.cut': 'Couper',
    'ctx.paste': 'Coller',
    'ctx.selectAll': 'Tout sélectionner',
    'ctx.back': 'Précédent',
    'ctx.forward': 'Suivant',
    'ctx.reload': 'Recharger',
    'ctx.bookmark': 'Ajouter aux favoris',
    'ctx.copyPageUrl': 'Copier l’adresse de la page',
    'ctx.inspect': 'Inspecter'
  },
  en: {
    'tab.new': 'New tab',
    'ctx.openLinkTab': 'Open link in new tab',
    'ctx.openLinkPrivate': 'Open link in private tab',
    'ctx.copyLink': 'Copy link address',
    'ctx.saveLink': 'Save link as…',
    'ctx.openImage': 'Open image in new tab',
    'ctx.saveImage': 'Save image as…',
    'ctx.copyImageUrl': 'Copy image address',
    'ctx.copy': 'Copy',
    'ctx.search': 'Search for “{q}”',
    'ctx.undo': 'Undo',
    'ctx.redo': 'Redo',
    'ctx.cut': 'Cut',
    'ctx.paste': 'Paste',
    'ctx.selectAll': 'Select all',
    'ctx.back': 'Back',
    'ctx.forward': 'Forward',
    'ctx.reload': 'Reload',
    'ctx.bookmark': 'Bookmark this page',
    'ctx.copyPageUrl': 'Copy page address',
    'ctx.inspect': 'Inspect'
  }
} satisfies Record<Language, Record<string, string>>

export type MainStringKey = keyof (typeof STRINGS)['fr']

/** Traduit une clé dans la langue de l'interface ; `{nom}` est remplacé par `vars.nom`. */
export function tr(key: MainStringKey, vars: Record<string, string> = {}): string {
  const table = STRINGS[getSettings().language] ?? STRINGS.fr
  return table[key].replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '')
}
