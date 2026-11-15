package af.zuri.browser

import android.content.Context
import org.json.JSONObject

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
    /** Empreinte ou code du téléphone pour revenir sur un onglet privé. */
    val lockPrivate: Boolean = false,
    val checkUpdates: Boolean = true,
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
        lockPrivate = prefs.getBoolean("lockPrivate", false),
        checkUpdates = prefs.getBoolean("checkUpdates", true),
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
            .putBoolean("lockPrivate", s.lockPrivate)
            .putBoolean("checkUpdates", s.checkUpdates)
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

/** Réglages pour la sauvegarde (la langue et la session ne sont pas incluses). */
fun Settings.toJson(): JSONObject = JSONObject()
    .put("searchEngine", searchEngine.id).put("adblock", adblock).put("safeBrowsing", safeBrowsing)
    .put("httpsOnly", httpsOnly).put("blockThirdPartyCookies", blockThirdPartyCookies).put("dataSaver", dataSaver)
    .put("autoplay", autoplay).put("restoreSession", restoreSession).put("refuseCookies", refuseCookies)
    .put("hideAdSlots", hideAdSlots).put("darkenSites", darkenSites).put("lockPrivate", lockPrivate)
    .put("checkUpdates", checkUpdates).put("dataPricePerGb", dataPricePerGb)

fun settingsFromJson(json: JSONObject, base: Settings) = base.copy(
    searchEngine = SearchEngine.byId(json.optString("searchEngine", base.searchEngine.id)),
    adblock = json.optBoolean("adblock", base.adblock),
    safeBrowsing = json.optBoolean("safeBrowsing", base.safeBrowsing),
    httpsOnly = json.optBoolean("httpsOnly", base.httpsOnly),
    blockThirdPartyCookies = json.optBoolean("blockThirdPartyCookies", base.blockThirdPartyCookies),
    dataSaver = json.optBoolean("dataSaver", base.dataSaver),
    autoplay = json.optBoolean("autoplay", base.autoplay),
    restoreSession = json.optBoolean("restoreSession", base.restoreSession),
    refuseCookies = json.optBoolean("refuseCookies", base.refuseCookies),
    hideAdSlots = json.optBoolean("hideAdSlots", base.hideAdSlots),
    darkenSites = json.optBoolean("darkenSites", base.darkenSites),
    lockPrivate = json.optBoolean("lockPrivate", base.lockPrivate),
    checkUpdates = json.optBoolean("checkUpdates", base.checkUpdates),
    dataPricePerGb = json.optInt("dataPricePerGb", base.dataPricePerGb).coerceIn(0, 1_000_000)
)
