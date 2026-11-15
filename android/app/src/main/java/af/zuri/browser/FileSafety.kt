package af.zuri.browser

import java.util.Locale

/** Fichiers qui installent une application ou exécutent du code : confirmation renforcée. */
object FileSafety {
    private val DANGEROUS = setOf(
        "apk", "apks", "xapk", "apkm", "aab", "dex", "jar",
        "exe", "msi", "msix", "bat", "cmd", "com", "scr", "pif", "cpl", "dll",
        "js", "jse", "vbs", "vbe", "wsf", "hta", "ps1", "lnk", "reg",
        "sh", "run", "bin", "deb", "rpm", "dmg", "pkg", "app"
    )

    fun extensionOf(name: String): String = name.substringAfterLast('.', "").lowercase(Locale.ROOT).trim()

    fun isDangerous(name: String): Boolean = extensionOf(name) in DANGEROUS

    /** Nom de fichier sûr : pas de chemin, pas de caractères de contrôle, longueur bornée. */
    fun sanitize(name: String): String {
        val base = name.substringAfterLast('/').substringAfterLast('\\')
            .filter { it >= ' ' && it !in "<>:\"|?*" }
            .trim().trimStart('.')
        val clean = base.ifEmpty { "telechargement" }
        if (clean.length <= 120) return clean
        val ext = extensionOf(clean)
        return clean.take(120 - ext.length - 1) + "." + ext
    }

    fun formatSize(bytes: Long): String? = when {
        bytes <= 0 -> null
        bytes < 1024 -> "$bytes o"
        bytes < 1024 * 1024 -> "${bytes / 1024} Ko"
        else -> String.format(Locale.FRANCE, "%.1f Mo", bytes / (1024.0 * 1024.0))
    }
}
