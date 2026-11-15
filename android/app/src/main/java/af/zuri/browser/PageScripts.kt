package af.zuri.browser

/**
 * Scripts injectés au début de chaque document (`addDocumentStartJavaScript`). Ils ne contiennent
 * que des données fixes (sélecteurs CSS) : aucune donnée de l'utilisateur, aucun canal vers
 * l'application, rien que la page puisse exploiter.
 */
object PageScripts {
    private const val CHUNK = 250
    const val MAX_SELECTORS = 4000

    /** Sélecteur CSS « générique » utilisable tel quel (sans syntaxe étendue Adblock). */
    fun isPlainSelector(selector: String): Boolean =
        selector.isNotBlank() && selector.length <= 300 &&
            selector.none { it in "{}<>\\@;\n\r" } &&
            EXTENDED.none { selector.contains(it) }

    /**
     * Masque les emplacements publicitaires vides (règles génériques `##…` d'EasyList), dans le
     * document principal seulement pour ménager les téléphones modestes. `:where()` tolère un
     * sélecteur invalide sans annuler tout le groupe.
     */
    fun cosmetic(selectors: List<String>): String {
        val css = selectors.asSequence().filter(::isPlainSelector).distinct().take(MAX_SELECTORS)
            .chunked(CHUNK).joinToString("") { ":where(" + it.joinToString(",") + "){display:none!important}" }
        if (css.isEmpty()) return ""
        return "(function(){if(window.top!==window||window.__zuriCss)return;window.__zuriCss=1;" +
            "var c=" + jsString(css) + ";" +
            "function a(){var s=document.createElement('style');s.textContent=c;(document.head||document.documentElement).appendChild(s);}" +
            "if(document.documentElement)a();else document.addEventListener('DOMContentLoaded',a);})();"
    }

    /**
     * Refuse les cookies non essentiels sur les bandeaux de consentement courants en cliquant leur
     * bouton « Refuser » (jamais « Accepter »). S'exécute aussi dans les cadres, où certains outils
     * affichent leur bandeau ; s'arrête au premier clic ou après 10 secondes.
     */
    val COOKIE_REFUSAL: String by lazy {
        val list = REFUSE_BUTTONS.joinToString(",", "[", "]") { jsString(it) }
        "(function(){if(window.__zuriConsent)return;window.__zuriConsent=1;var S=$list,n=0,t;" +
            "function v(e){return e&&e.getClientRects().length>0&&!e.disabled;}" +
            "function f(){for(var i=0;i<S.length;i++){var e;try{e=document.querySelector(S[i]);}catch(x){continue;}" +
            "if(v(e)){e.click();return true;}}return false;}" +
            "function k(){if(f()||++n>20)clearInterval(t);}" +
            "t=setInterval(k,500);document.addEventListener('DOMContentLoaded',k);})();"
    }

    /** Boutons « Refuser » des principaux outils de consentement (CMP). */
    val REFUSE_BUTTONS = listOf(
        "#onetrust-reject-all-handler",
        "#didomi-notice-disagree-button",
        ".didomi-continue-without-agreeing",
        "#CybotCookiebotDialogBodyButtonDecline",
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
        ".fc-cta-do-not-consent",
        ".qc-cmp2-summary-buttons button[mode=\"secondary\"]",
        "button.sp_choice_type_REJECT_ALL",
        "#tarteaucitronAllDenied2",
        "#axeptio_btn_dismiss",
        ".cky-btn-reject",
        ".cmplz-deny",
        ".osano-cm-denyAll",
        ".cc-deny",
        ".iubenda-cs-reject-btn",
        "[data-tid=\"banner-decline\"]",
        "[data-cookiefirst-action=\"reject\"]",
        "#cookiescript_reject",
        "#wt-cli-reject-btn",
        "#cookie_action_close_header_reject",
        ".moove-gdpr-infobar-reject-btn",
        ".cn-decline",
        "#truste-consent-required"
    )

    private val EXTENDED = listOf(":-abp-", ":has-text(", ":style(", ":remove(", ":xpath(", ":upward(", ":matches-", ":min-text-length(", ":watch-attr(")

    /** Chaîne JavaScript entre guillemets, sûre même dans un <script>. */
    fun jsString(value: String): String = buildString(value.length + 2) {
        append('"')
        for (c in value) when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c == '<' -> append("\\u003c")
            c == '>' -> append("\\u003e")
            c == ' ' -> append("\\u2028")
            c == ' ' -> append("\\u2029")
            c < ' ' -> append("\\u%04x".format(c.code))
            else -> append(c)
        }
        append('"')
    }
}
