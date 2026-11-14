package af.zuri.browser

import android.webkit.WebView
import java.util.concurrent.atomic.AtomicInteger

class Tab(val id: Int, val isPrivate: Boolean, val webView: WebView, val parentId: Int?) {
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
}
