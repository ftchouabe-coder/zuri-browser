package af.zuri.browser

import android.webkit.WebView
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Un onglet. Sa WebView n'est créée qu'au premier usage : les onglets restaurés au démarrage
 * ne coûtent ni mémoire ni temps tant qu'on ne les ouvre pas (important sur entrée de gamme).
 */
class Tab(val id: Int, val isPrivate: Boolean, val parentId: Int?, private val factory: (Tab) -> WebView) {
    private var view: WebView? = null

    val webView: WebView
        get() = view ?: factory(this).also { view = it }

    val hasWebView: Boolean get() = view != null

    /** URL affichée dans la barre d'adresse (vide pour la page d'accueil). */
    var url = ""
    var title = ""
    var progress = 100
    /** Une page interne (accueil, erreur, avertissement) est affichée. */
    var internalPage = false
    /** URL à charger lors de la première sélection (onglets restaurés). */
    var pendingUrl: String? = null
    var desktopMode = false
    /** Dernière navigation principale demandée (pour relier les erreurs TLS). */
    var loadingUrl = ""
    /** URL de la page principale, lue depuis le fil réseau. */
    @Volatile var pageUrl = ""
    val blocked = AtomicInteger()
    val popups = PopupLimiter()
    /** Hôtes autorisés en HTTP dans cet onglet après avertissement. */
    val insecureHosts = HashSet<String>()
    /** Passages en HTTPS : URL https -> (URL http d'origine, instant). */
    val upgrades = HashMap<String, Pair<String, Long>>()
    var certErrorUrl: String? = null
    /** Hôtes signalés que l'utilisateur a choisi d'ouvrir malgré tout : hôte -> expiration. */
    val unsafeHosts = ConcurrentHashMap<String, Long>()
    /** Scripts injectés en début de document, et la configuration qu'ils reflètent. */
    var scripts: List<androidx.webkit.ScriptHandler> = emptyList()
    var scriptKey = ""
    /** Article extrait (mode lecture, voix, lecture hors ligne). */
    var article: Article? = null
    /** L'utilisateur a demandé les images malgré l'économiseur de données. */
    var forceImages = false
}
