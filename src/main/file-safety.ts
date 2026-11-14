/**
 * Classement des fichiers téléchargés (module pur, testé unitairement).
 * Liste inspirée des extensions « dangereuses » de Chromium pour Windows : tout ce qui
 * s'exécute, s'installe ou lance un interpréteur d'un double-clic.
 */
const DANGEROUS_EXTENSIONS = new Set([
  'ad', 'ade', 'adp', 'app', 'application', 'appref-ms', 'appx', 'appxbundle', 'asp', 'bas',
  'bat', 'bin', 'cab', 'chm', 'cmd', 'com', 'cpl', 'crt', 'dll', 'diagcab', 'exe', 'gadget',
  'grp', 'hlp', 'hta', 'htt', 'inf', 'ins', 'iso', 'img', 'isp', 'jar', 'jnlp', 'js', 'jse',
  'ksh', 'lnk', 'mad', 'maf', 'mag', 'mam', 'maq', 'mar', 'mas', 'mat', 'mau', 'mav', 'maw',
  'mda', 'mdb', 'mde', 'mdt', 'mdw', 'mdz', 'msc', 'msh', 'msh1', 'msh2', 'mshxml', 'msh1xml',
  'msh2xml', 'msi', 'msix', 'msixbundle', 'msp', 'mst', 'ocx', 'ops', 'pcd', 'pif', 'pl',
  'plg', 'prf', 'prg', 'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'psd1', 'psm1',
  'pst', 'py', 'pyc', 'pyo', 'pyw', 'pyz', 'reg', 'scf', 'scr', 'sct', 'search-ms', 'settingcontent-ms',
  'shb', 'shs', 'sys', 'theme', 'tmp', 'url', 'vb', 'vbe', 'vbs', 'vhd', 'vhdx', 'vsmacros',
  'vsw', 'vxd', 'website', 'ws', 'wsc', 'wsf', 'wsh', 'xbap', 'xll', 'xnk',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm', 'sldm'
])

/** Extension finale en minuscules, sans les points ni espaces de fin ignorés par Windows. */
export function extensionOf(filename: string): string {
  const base = filename.replace(/[\s.]+$/, '').split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isDangerousFile(filename: string): boolean {
  return DANGEROUS_EXTENSIONS.has(extensionOf(filename))
}

/**
 * Contenu du flux NTFS `Zone.Identifier` (« Mark of the Web ») : Windows SmartScreen,
 * Office (mode protégé) et l'Explorateur s'en servent pour avertir avant ouverture.
 * En navigation privée, les URL ne sont pas inscrites sur le disque.
 */
export function zoneIdentifier(url: string, referrer: string, isPrivate: boolean): string {
  const lines = ['[ZoneTransfer]', 'ZoneId=3']
  if (!isPrivate) {
    const clean = (value: string): string | null => {
      try {
        const parsed = new URL(value)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        parsed.username = ''
        parsed.password = ''
        return parsed.href.replace(/[\r\n]/g, '')
      } catch {
        return null
      }
    }
    const ref = clean(referrer)
    const host = clean(url)
    if (ref) lines.push(`ReferrerUrl=${ref}`)
    if (host) lines.push(`HostUrl=${host}`)
  }
  return `${lines.join('\r\n')}\r\n`
}
