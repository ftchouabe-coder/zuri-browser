package af.zuri.browser

import android.content.Context

/** Réglages, avec des valeurs par défaut protectrices. */
data class Settings(
    val searchEngine: SearchEngine = SearchEngine.DUCKDUCKGO,
    val adblock: Boolean = true,
    val safeBrowsing: Boolean = true,
    val httpsOnly: Boolean = true,
    val blockThirdPartyCookies: Boolean = true,
    /** Économiseur de données : images bloquées sur réseau payant (données mobiles), pas en Wi-Fi. */
    val dataSaver: Boolean = false,
    val autoplay: Boolean = false,
    val restoreSession: Boolean = true,
    val refuseCookies: Boolean = true,
    val hideAdSlots: Boolean = true,
    /** Assombrir les sites quand le téléphone est en mode sombre. */
    val darkenSites: Boolean = true,
    /** Prix d'1 Go de données mobiles, pour estimer les économies (0 = non renseigné). */
    val dataPricePerGb: Int = 0
)

class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("zuri", Context.MODE_PRIVATE)

    fun load() = Settings(
        searchEngine = SearchEngine.byId(prefs.getString("searchEngine", null)),
        adblock = prefs.getBoolean("adblock", true),
        safeBrowsing = prefs.getBoolean("safeBrowsing", true),
        httpsOnly = prefs.getBoolean("httpsOnly", true),
        blockThirdPartyCookies = prefs.getBoolean("blockThirdPartyCookies", true),
        dataSaver = prefs.getBoolean("dataSaver", false),
        autoplay = prefs.getBoolean("autoplay", false),
        restoreSession = prefs.getBoolean("restoreSession", true),
        refuseCookies = prefs.getBoolean("refuseCookies", true),
        hideAdSlots = prefs.getBoolean("hideAdSlots", true),
        darkenSites = prefs.getBoolean("darkenSites", true),
        dataPricePerGb = prefs.getInt("dataPricePerGb", 0).coerceIn(0, 1_000_000)
    )

    fun save(s: Settings) {
        prefs.edit()
            .putString("searchEngine", s.searchEngine.id)
            .putBoolean("adblock", s.adblock)
            .putBoolean("safeBrowsing", s.safeBrowsing)
            .putBoolean("httpsOnly", s.httpsOnly)
            .putBoolean("blockThirdPartyCookies", s.blockThirdPartyCookies)
            .putBoolean("dataSaver", s.dataSaver)
            .putBoolean("autoplay", s.autoplay)
            .putBoolean("restoreSession", s.restoreSession)
            .putBoolean("refuseCookies", s.refuseCookies)
            .putBoolean("hideAdSlots", s.hideAdSlots)
            .putBoolean("darkenSites", s.darkenSites)
            .putInt("dataPricePerGb", s.dataPricePerGb)
            .apply()
    }

    /** Onglets normaux à rouvrir (jamais les onglets privés). */
    fun saveSession(urls: List<String>, index: Int) {
        val clean = urls.filter { UrlInput.isHttp(it) && '\n' !in it }
        prefs.edit()
            .putString("session", clean.joinToString("\n"))
            .putInt("sessionIndex", index.coerceIn(0, (clean.size - 1).coerceAtLeast(0)))
            .apply()
    }

    fun loadSession(): Pair<List<String>, Int> {
        val urls = prefs.getString("session", "").orEmpty().split('\n').filter { UrlInput.isHttp(it) }
        return urls to prefs.getInt("sessionIndex", 0)
    }

    fun clearSession() {
        prefs.edit().remove("session").remove("sessionIndex").apply()
    }
}
