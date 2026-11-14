package af.zuri.browser

import java.net.URLEncoder
import java.util.Locale

/** Interprétation de la barre d'adresse (même logique que `src/main/search.ts`). */
object UrlInput {
    private val SCHEME = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:")
    private val WEB_URL = Regex("^https?://[^/?#\\s]+\\S*$", RegexOption.IGNORE_CASE)
    private val HOST = Regex("^[a-zA-Z0-9\\u00a1-\\uffff-]+(\\.[a-zA-Z0-9\\u00a1-\\uffff-]+)+(:\\d+)?([/?#].*)?$")
    private val LOCALHOST = Regex("^(localhost|127\\.0\\.0\\.1|\\[::1])(:\\d+)?([/?#].*)?$", RegexOption.IGNORE_CASE)
    private val HOST_OF = Regex("^[a-z][a-z0-9+.-]*://(?:[^@/?#]*@)?(\\[[^]]+]|[^/?#:]+)", RegexOption.IGNORE_CASE)
    private val PRIVATE_IPV4 = Regex("^(10\\.|127\\.|192\\.168\\.|169\\.254\\.|172\\.(1[6-9]|2\\d|3[01])\\.)")

    /**
     * Convertit une saisie en URL chargeable, ou `null` si ce n'est pas une adresse.
     * Seuls http(s) sont acceptés : `javascript:`, `file:`, `content:`, `intent:`… sont refusés
     * (la saisie devient alors une recherche).
     */
    fun toNavigableUrl(input: String): String? {
        val value = input.trim()
        if (value.isEmpty()) return null
        if (LOCALHOST.matches(value)) return "http://$value"
        if (SCHEME.containsMatchIn(value)) {
            val scheme = value.substringBefore(':').lowercase(Locale.ROOT)
            if (scheme == "http" || scheme == "https") return if (WEB_URL.matches(value)) value else null
            // Sinon, peut-être « hote:port » : traité ci-dessous.
        }
        if (value.any { it.isWhitespace() }) return null
        if (HOST.matches(value)) return "https://$value"
        return null
    }

    /** URL à charger pour une saisie : adresse, ou recherche avec le moteur choisi. */
    fun resolve(input: String, engine: SearchEngine): String {
        val value = input.trim()
        if (value.isEmpty()) return ""
        return toNavigableUrl(value) ?: engine.searchUrl.replace("%s", URLEncoder.encode(value, "UTF-8"))
    }

    fun isHttp(url: String): Boolean = url.startsWith("http://", true) || url.startsWith("https://", true)

    /** Nom d'hôte en minuscules (sans crochets IPv6), ou `null`. */
    fun hostOf(url: String): String? =
        HOST_OF.find(url)?.groupValues?.get(1)?.trim('[', ']')?.lowercase(Locale.ROOT)?.takeIf { it.isNotEmpty() }

    /** Domaine lisible pour l'interface. */
    fun displayHost(url: String): String = hostOf(url)?.removePrefix("www.") ?: url

    /**
     * Faut-il passer cette adresse HTTP en HTTPS ? Non pour les hôtes locaux (réseau domestique,
     * box, imprimante) qui n'ont presque jamais de certificat valide.
     */
    fun shouldUpgrade(url: String): Boolean {
        if (!url.startsWith("http://", true)) return false
        val host = hostOf(url) ?: return false
        if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false
        if (host == "::1" || PRIVATE_IPV4.containsMatchIn(host)) return false
        if (!host.contains('.') && !host.contains(':')) return false
        return true
    }

    fun toHttps(url: String): String = "https://" + url.substring("http://".length)
}
