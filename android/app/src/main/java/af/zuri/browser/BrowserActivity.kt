package af.zuri.browser

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.Activity
import android.app.AlertDialog
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.text.format.DateUtils
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.HttpAuthHandler
import android.webkit.URLUtil
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewDatabase
import android.widget.AutoCompleteTextView
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.Filter
import android.widget.Filterable
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ProfileStore
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.text.NumberFormat
import java.time.YearMonth
import java.net.URISyntaxException
import java.util.Locale

class BrowserActivity : Activity() {

    private lateinit var prefs: Prefs
    /** Lu aussi depuis le fil réseau de la WebView (interception des requêtes). */
    @Volatile internal var settings = Settings()
        private set
    private val filters: FilterLists by lazy { sharedFilters(this) }
    private val library: Library by lazy { LibraryStore.shared(this) }
    private val shelf: OfflineShelf by lazy { OfflineStore.shared(this) }
    private val savings: SavingsCounter by lazy { sharedSavings(this) }

    private lateinit var root: View
    private lateinit var toolbar: View
    private lateinit var address: AutoCompleteTextView
    private lateinit var tabsButton: TextView
    private lateinit var menuButton: ImageButton
    private lateinit var shieldButton: ImageButton
    private lateinit var progress: ProgressBar
    private lateinit var content: FrameLayout
    private lateinit var findBar: View
    private lateinit var findInput: EditText
    private lateinit var findCount: TextView

    private val tabs = mutableListOf<Tab>()
    private var current: Tab? = null
    private var nextTabId = 1
    private val actions = InternalActions()

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermissions: ((Boolean) -> Unit)? = null
    private var permissionsAnyOf = false
    private var permissionDialog: AlertDialog? = null
    private var permissionDialogRequest: PermissionRequest? = null
    /** Choix faits pendant la session : "privé|origine|ressource" -> autorisé. Jamais écrits sur disque. */
    private val sitePermissions = HashMap<String, Boolean>()
    /** Réseau payant (données mobiles, partage de connexion…) : lu par l'économiseur de données. */
    @Volatile private var metered = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private val privateSupported by lazy { WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE) }

    // ---------------------------------------------------------------- cycle de vie

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_browser)
        prefs = Prefs(this)
        settings = prefs.load()

        root = findViewById(R.id.root)
        toolbar = findViewById(R.id.toolbar)
        address = findViewById(R.id.address)
        tabsButton = findViewById(R.id.tabs)
        menuButton = findViewById(R.id.menu)
        shieldButton = findViewById(R.id.shield)
        progress = findViewById(R.id.progress)
        content = findViewById(R.id.content)
        findBar = findViewById(R.id.find_bar)
        findInput = findViewById(R.id.find_input)
        findCount = findViewById(R.id.find_count)
        setupFindBar()

        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }

        address.setOnEditorActionListener { _, actionId, event ->
            val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
            if (actionId == EditorInfo.IME_ACTION_GO || enter) {
                current?.let { navigate(it, address.text.toString()) }
                address.clearFocus()
                hideKeyboard()
                true
            } else {
                false
            }
        }
        address.setOnFocusChangeListener { _, hasFocus -> if (!hasFocus) render() }
        address.threshold = 1
        address.setAdapter(SuggestionAdapter())
        address.setOnItemClickListener { parent, _, position, _ ->
            val choice = parent.getItemAtPosition(position) as? Suggestion ?: return@setOnItemClickListener
            current?.let { load(it, choice.url) }
            address.clearFocus()
            hideKeyboard()
        }
        tabsButton.setOnClickListener { showTabs() }
        menuButton.setOnClickListener { showMenu(it) }
        shieldButton.setOnClickListener { showShield() }

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        registerBackHandler()
        filters // chargement des listes en tâche de fond
        watchNetwork()
        // Reste d'une session privée interrompue (application tuée) : effacé avant tout.
        clearPrivateData(atStartup = true)

        if (settings.restoreSession) restoreSession()
        handleIntent(intent)
        if (tabs.isEmpty()) newTab(private = false)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        current?.webView?.resumeTimers()
        current?.webView?.onResume()
        current?.let(::guardPrivate)
    }

    override fun onStop() {
        super.onStop()
        // L'invite d'authentification elle-même met l'activité en arrière-plan : on l'ignore.
        if (!authenticating) lockIfNeeded()
    }

    override fun onPause() {
        super.onPause()
        saveSession()
        persistSavings()
        current?.webView?.onPause()
        current?.webView?.pauseTimers()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        networkCallback?.let { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) }
        tts?.shutdown()
        tts = null
        val hadPrivate = tabs.any { it.isPrivate }
        for (tab in tabs) destroyWebView(tab)
        tabs.clear()
        if (hadPrivate) clearPrivateData()
        super.onDestroy()
    }

    /** Android 8 à 12 seulement : à partir d'Android 13, le rappel enregistré ci-dessous est utilisé. */
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Remplacé par OnBackInvokedCallback à partir d'Android 13")
    override fun onBackPressed() {
        if (!handleBack()) moveTaskToBack(true)
    }

    private fun registerBackHandler() {
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                if (!handleBack()) moveTaskToBack(true)
            }
        }
    }

    @Deprecated("startActivityForResult suffit ici : pas de dépendance à androidx.activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_UNLOCK) {
            if (resultCode == RESULT_OK) unlocked() else authenticating = false
            return
        }
        if (requestCode == REQUEST_FILE) {
            val callback = fileCallback ?: return
            fileCallback = null
            val uris = if (resultCode == RESULT_OK && data != null) {
                val clip = data.clipData
                if (clip != null) Array(clip.itemCount) { clip.getItemAt(it).uri } else data.data?.let { arrayOf(it) }
            } else {
                null
            }
            callback.onReceiveValue(uris)
        }
    }

    private fun handleIntent(intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_VIEW -> {
                val url = intent.dataString
                if (url != null && UrlInput.isHttp(url)) createTab(url, private = false)
            }
            Intent.ACTION_WEB_SEARCH -> {
                val query = intent.getStringExtra(SearchManager.QUERY)
                if (!query.isNullOrBlank()) createTab(UrlInput.resolve(query, settings.searchEngine), private = false)
            }
        }
        // L'intention est traitée une seule fois, même si l'activité est recréée.
        setIntent(Intent(Intent.ACTION_MAIN))
    }

    private fun restoreSession() {
        val (urls, index) = prefs.loadSession()
        for (url in urls) createTab(null, private = false, foreground = false, pendingUrl = url)
        tabs.getOrNull(index.coerceIn(0, (tabs.size - 1).coerceAtLeast(0)))?.let(::selectTab)
    }

    private fun saveSession() {
        if (!settings.restoreSession) {
            prefs.clearSession()
            return
        }
        val normal = tabs.filter { !it.isPrivate && UrlInput.isHttp(it.pendingUrl ?: it.url) }
        prefs.saveSession(normal.map { it.pendingUrl ?: it.url }, normal.indexOf(current))
    }

    // ---------------------------------------------------------------- onglets

    private fun newTab(private: Boolean) {
        if (private && !privateSupported) {
            toast(R.string.private_unsupported)
            return
        }
        createTab(null, private)
        address.requestFocus()
        showKeyboard()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createTab(
        url: String?,
        private: Boolean,
        foreground: Boolean = true,
        parentId: Int? = null,
        pendingUrl: String? = null
    ): Tab {
        val tab = Tab(nextTabId++, private, parentId, ::buildWebView)
        val parentIndex = parentId?.let { id -> tabs.indexOfFirst { it.id == id } } ?: -1
        if (parentIndex >= 0) tabs.add(parentIndex + 1, tab) else tabs.add(tab)

        when {
            url != null -> load(tab, url)
            pendingUrl != null -> {
                tab.pendingUrl = pendingUrl
                tab.url = pendingUrl
                tab.title = UrlInput.displayHost(pendingUrl)
            }
            parentId == null -> showStartPage(tab)
            // Fenêtre surgissante : le contenu arrive par WebViewTransport.
        }
        if (foreground) selectTab(tab) else if (tab.hasWebView) tab.webView.onPause()
        render()
        return tab
    }

    /** Création effective de la WebView d'un onglet, au premier usage. */
    private fun buildWebView(tab: Tab): WebView {
        val webView = WebView(this)
        // Onglet privé : profil WebView distinct (cookies, stockage, cache, autorisations).
        if (tab.isPrivate && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            WebViewCompat.setProfile(webView, PRIVATE_PROFILE)
        }
        configure(tab, webView)
        webView.setFindListener { active, total, _ ->
            if (tab === current) findCount.text = if (total == 0) "0/0" else "${active + 1}/$total"
        }
        webView.setDownloadListener { url, agent, disposition, mime, length ->
            onDownload(tab, url, agent, disposition, mime, length)
        }
        webView.webViewClient = ZuriWebViewClient(this, tab)
        webView.webChromeClient = ZuriChromeClient(this, tab)
        refreshScripts(tab, webView)
        return webView
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configure(tab: Tab, webView: WebView) {
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.setSupportMultipleWindows(true)
        s.javaScriptCanOpenWindowsAutomatically = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.setGeolocationEnabled(true)
        applySettings(tab, webView)
    }

    private fun applySettings(tab: Tab, webView: WebView? = if (tab.hasWebView) tab.webView else null) {
        // Onglet pas encore ouvert : les réglages seront appliqués à la création de sa WebView.
        if (webView == null) return
        val s = webView.settings
        s.safeBrowsingEnabled = settings.safeBrowsing
        s.mediaPlaybackRequiresUserGesture = !settings.autoplay
        s.blockNetworkImage = imagesBlocked(tab)
        s.userAgentString = userAgent(tab.desktopMode)
        // Mode sombre du téléphone : les sites sans thème sombre sont assombris par le moteur.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, settings.darkenSites)
        }
        cookieManagerFor(tab).setAcceptThirdPartyCookies(webView, !settings.blockThirdPartyCookies)
    }

    private fun cookieManagerFor(tab: Tab): CookieManager =
        if (tab.isPrivate && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            ProfileStore.getInstance().getOrCreateProfile(PRIVATE_PROFILE).cookieManager
        } else {
            CookieManager.getInstance()
        }

    /** Agent utilisateur de Chrome : sans le marqueur « wv », certains sites dégradent l'affichage. */
    private fun userAgent(desktop: Boolean): String {
        val base = WebSettings.getDefaultUserAgent(this)
        if (!desktop) return base.replace("; wv)", ")").replace(" Version/4.0", "")
        val major = Regex("Chrome/(\\d+)").find(base)?.groupValues?.get(1) ?: "130"
        return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$major.0.0.0 Safari/537.36"
    }

    private fun selectTab(tab: Tab) {
        val previous = current
        if (previous !== tab && findBar.visibility == View.VISIBLE) hideFind()
        if (previous != null && previous !== tab && previous.hasWebView) {
            previous.webView.onPause()
            content.removeView(previous.webView)
        }
        current = tab
        if (tab.webView.parent == null) {
            content.addView(tab.webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        tab.webView.onResume()
        tab.pendingUrl?.let { load(tab, it) }
        guardPrivate(tab)
        // Onglet privé : pas de capture d'écran ni d'aperçu dans les applications récentes.
        if (tab.isPrivate) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        render()
    }

    internal fun closeTab(tab: Tab) {
        val index = tabs.indexOf(tab)
        if (index < 0) return
        tabs.removeAt(index)
        actions.forgetTab(tab.id)
        destroyWebView(tab)
        if (tab.isPrivate && tabs.none { it.isPrivate }) clearPrivateData()
        if (current === tab) {
            current = null
            val next = tabs.firstOrNull { it.id == tab.parentId } ?: tabs.getOrNull(index.coerceAtMost(tabs.size - 1))
            if (next != null) selectTab(next) else newTab(private = false)
        }
        render()
    }

    private fun destroyWebView(tab: Tab) {
        if (!tab.hasWebView) return
        content.removeView(tab.webView)
        tab.webView.stopLoading()
        tab.webView.webChromeClient = null
        tab.webView.destroy()
    }

    // ---------------------------------------------------------------- navigation

    private fun navigate(tab: Tab, input: String) {
        val url = UrlInput.resolve(input, settings.searchEngine)
        if (url.isEmpty()) showStartPage(tab) else load(tab, url)
    }

    internal fun load(tab: Tab, url: String) {
        tab.pendingUrl = null
        tab.certErrorUrl = null
        val host = UrlInput.hostOf(url)
        val target = if (settings.httpsOnly && UrlInput.shouldUpgrade(url) && host !in tab.insecureHosts) {
            UrlInput.toHttps(url).also { tab.upgrades[it] = url to SystemClock.elapsedRealtime() }
        } else {
            url
        }
        tab.internalPage = false
        tab.loadingUrl = target
        tab.url = target
        refreshScripts(tab, tab.webView)
        tab.webView.loadUrl(target)
        render()
    }

    /** Navigation principale vers http:// ; `true` si elle est prise en charge ici. */
    internal fun onHttpNavigation(tab: Tab, url: String, isRedirect: Boolean): Boolean {
        val host = UrlInput.hostOf(url)
        if (!settings.httpsOnly || !UrlInput.shouldUpgrade(url) || host in tab.insecureHosts) {
            tab.loadingUrl = url
            return false
        }
        val https = UrlInput.toHttps(url)
        val now = SystemClock.elapsedRealtime()
        val previous = tab.upgrades[https]
        if (isRedirect && previous != null && now - previous.second < LOOP_WINDOW_MS) {
            // La version HTTPS renvoie vers HTTP : le site n'est pas disponible en HTTPS.
            showInsecureWarning(tab, url)
            return true
        }
        tab.upgrades[https] = url to now
        tab.loadingUrl = https
        tab.webView.loadUrl(https)
        return true
    }

    internal fun onInternalLink(tab: Tab, uri: Uri) {
        val action = actions.take(uri.getQueryParameter("t"), tab.id) ?: return
        when (action.kind) {
            InternalActions.Kind.RETRY -> load(tab, action.url)
            InternalActions.Kind.BACK -> if (!goBack(tab)) showStartPage(tab)
            InternalActions.Kind.INSECURE -> {
                UrlInput.hostOf(action.url)?.let(tab.insecureHosts::add)
                tab.internalPage = false
                tab.loadingUrl = action.url
                tab.webView.loadUrl(action.url)
            }
            InternalActions.Kind.PROCEED_UNSAFE -> {
                // Exception limitée à cet hôte, dans cet onglet, pendant 10 minutes.
                UrlInput.hostOf(action.url)?.let { tab.unsafeHosts[it] = SystemClock.elapsedRealtime() + UNSAFE_ALLOW_MS }
                load(tab, action.url)
            }
        }
    }

    /**
     * Fil réseau de la WebView. Sites signalés : page d'avertissement à la place du document
     * (ou requête vide pour un cadre). Publicités et traqueurs : requête vide, sauf vers le
     * site de la page elle-même, pour ne pas casser les sites qui hébergent leurs propres outils.
     */
    internal fun intercept(tab: Tab, request: WebResourceRequest): WebResourceResponse? {
        val uri = request.url
        val scheme = uri.scheme ?: return null
        if (!scheme.equals("http", true) && !scheme.equals("https", true)) return null
        val host = uri.host?.lowercase(Locale.ROOT)?.trimEnd('.') ?: return null
        val url = uri.toString()
        val config = settings

        if (config.safeBrowsing) {
            val threat = filters.threatFor(host, url)
            if (threat != null) {
                val until = tab.unsafeHosts[host]
                if (until == null || until < SystemClock.elapsedRealtime()) {
                    tab.blocked.incrementAndGet()
                savings.add(thisMonth())
                    savings.add(thisMonth())
                    return if (request.isForMainFrame) threatResponse(tab, url, host, threat) else emptyResponse()
                }
            }
        }
        // Faux site de mobile money ou de banque (nom d'hôte imitant une marque).
        if (config.safeBrowsing && request.isForMainFrame) {
            val match = Lookalike.check(host)
            val until = tab.unsafeHosts[host]
            if (match != null && (until == null || until < SystemClock.elapsedRealtime())) {
                return lookalikeResponse(tab, url, match)
            }
        }
        if (config.adblock && !request.isForMainFrame && filters.ads.matches(host, url)) {
            val pageHost = UrlInput.hostOf(tab.pageUrl)
            if (pageHost == null || DomainSet.siteOf(pageHost) != DomainSet.siteOf(host)) {
                tab.blocked.incrementAndGet()
                savings.add(thisMonth())
                return emptyResponse()
            }
        }
        return null
    }

    private fun lookalikeResponse(tab: Tab, url: String, match: Lookalike.Match): WebResourceResponse {
        val heading = getString(R.string.lookalike_heading, match.brand.name)
        val html = Pages.message(
            getString(R.string.lang), heading, heading,
            getString(R.string.lookalike_message, match.host, match.brand.name),
            getString(R.string.lookalike_detail, match.brand.example),
            listOf(
                Pages.Action(getString(R.string.threat_back), actions.href(tab.id, url, InternalActions.Kind.BACK), primary = true),
                Pages.Action(getString(R.string.lookalike_proceed), actions.href(tab.id, url, InternalActions.Kind.PROCEED_UNSAFE))
            ),
            Pages.Tone.WARNING
        )
        return htmlResponse(html)
    }

    private fun htmlResponse(html: String): WebResourceResponse {
        val headers = mapOf(
            "Content-Security-Policy" to Pages.CSP,
            "Cache-Control" to "no-store",
            "Referrer-Policy" to "no-referrer",
            "X-Content-Type-Options" to "nosniff"
        )
        return WebResourceResponse("text/html", "utf-8", 200, "OK", headers, ByteArrayInputStream(html.toByteArray()))
    }

    private fun emptyResponse() = WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))

    private fun threatResponse(tab: Tab, url: String, host: String, threat: FilterLists.Threat): WebResourceResponse {
        val phishing = threat == FilterLists.Threat.PHISHING
        val heading = getString(if (phishing) R.string.threat_phishing_heading else R.string.threat_malware_heading)
        val body = getString(if (phishing) R.string.threat_phishing_message else R.string.threat_malware_message, host)
        val html = Pages.message(
            getString(R.string.lang), heading, heading, body, getString(R.string.threat_source),
            listOf(
                Pages.Action(getString(R.string.threat_back), actions.href(tab.id, url, InternalActions.Kind.BACK), primary = true),
                Pages.Action(getString(R.string.threat_proceed), actions.href(tab.id, url, InternalActions.Kind.PROCEED_UNSAFE))
            ),
            Pages.Tone.DANGER
        )
        val headers = mapOf(
            "Content-Security-Policy" to Pages.CSP,
            "Cache-Control" to "no-store",
            "Referrer-Policy" to "no-referrer",
            "X-Content-Type-Options" to "nosniff"
        )
        return WebResourceResponse("text/html", "utf-8", 200, "OK", headers, ByteArrayInputStream(html.toByteArray()))
    }

    private fun goBack(tab: Tab): Boolean {
        val webView = tab.webView
        if (tab.internalPage) {
            // L'échec de chargement laisse souvent une entrée d'erreur juste avant la page interne.
            val list = webView.copyBackForwardList()
            val here = list.currentItem?.url
            val previous = list.getItemAtIndex(list.currentIndex - 1)?.url
            if (here != null && here == previous && webView.canGoBackOrForward(-2)) {
                webView.goBackOrForward(-2)
                return true
            }
        }
        if (webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return false
    }

    private fun handleBack(): Boolean {
        if (customView != null) {
            hideCustomView()
            return true
        }
        if (findBar.visibility == View.VISIBLE) {
            hideFind()
            return true
        }
        if (address.hasFocus()) {
            address.clearFocus()
            hideKeyboard()
            return true
        }
        val tab = current ?: return false
        if (goBack(tab)) return true
        if (tab.parentId != null || tabs.size > 1 && tab.isPrivate) {
            closeTab(tab)
            return true
        }
        return false
    }

    internal fun openExternal(tab: Tab, uri: Uri, hasGesture: Boolean) {
        // Jamais d'ouverture d'application sans action de l'utilisateur (redirections, scripts).
        if (!hasGesture) return
        val intent = try {
            if (uri.scheme.equals("intent", true)) Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
            else Intent(Intent.ACTION_VIEW, uri)
        } catch (_: URISyntaxException) {
            return
        }
        // Une page ne choisit ni le composant cible ni des droits sur des fichiers.
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.component = null
        intent.selector = null
        intent.flags = intent.flags and (
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            ).inv()
        val fallback = intent.getStringExtra("browser_fallback_url")?.takeIf { UrlInput.isHttp(it) }
        val data = intent.dataString
        if (data != null && UrlInput.isHttp(data) && intent.`package` == null) {
            load(tab, data)
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.external_title)
            .setMessage(getString(R.string.external_message, uri.toString().take(200)))
            .setPositiveButton(R.string.open) { _, _ ->
                try {
                    startActivity(intent)
                } catch (_: ActivityNotFoundException) {
                    if (fallback != null) load(tab, fallback) else toast(R.string.no_app)
                } catch (_: SecurityException) {
                    toast(R.string.no_app)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    internal fun openPopup(opener: Tab, isUserGesture: Boolean, resultMsg: Message): Boolean {
        val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
        val allowed = if (isUserGesture) {
            opener.popups.allow(SystemClock.elapsedRealtime())
        } else {
            opener.popups.recordBlocked()
            false
        }
        if (!allowed) {
            if (opener === current) toast(R.string.popup_blocked)
            render()
            return false
        }
        // La nouvelle page garde window.opener (connexions Google/Microsoft, paiements).
        val tab = createTab(null, opener.isPrivate, foreground = true, parentId = opener.id)
        transport.webView = tab.webView
        resultMsg.sendToTarget()
        return true
    }

    internal fun onRendererGone(tab: Tab) {
        toast(R.string.renderer_gone)
        closeTab(tab)
    }

    // ---------------------------------------------------------------- pages internes

    private fun renderPage(tab: Tab, historyUrl: String?, title: String, html: String) {
        tab.internalPage = true
        tab.title = title
        tab.url = historyUrl.orEmpty()
        tab.pageUrl = ""
        tab.progress = 100
        tab.webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", historyUrl)
        render()
    }

    private fun showStartPage(tab: Tab) {
        val note = if (tab.isPrivate) getString(R.string.start_private) else null
        val title = getString(R.string.start_title)
        renderPage(tab, null, title, Pages.start(getString(R.string.lang), title, getString(R.string.start_tagline), note, savingsSummary()))
        tab.title = ""
    }

    internal fun showLoadError(tab: Tab, url: String, code: Int, description: String) {
        if (url == tab.certErrorUrl) return
        // Navigation remplacée par une autre (ou annulée par Zuri) : rien à afficher.
        if (description.contains("ERR_ABORTED") || description.contains("ERR_BLOCKED_BY_CLIENT")) return
        val original = tab.upgrades[url]?.first
        if (original != null && code != android.webkit.WebViewClient.ERROR_HOST_LOOKUP) {
            showInsecureWarning(tab, original)
            return
        }
        val title = getString(R.string.error_title)
        val html = Pages.message(
            getString(R.string.lang), title, getString(R.string.error_heading),
            getString(R.string.error_message, UrlInput.displayHost(url)), description,
            listOf(
                Pages.Action(getString(R.string.error_retry), actions.href(tab.id, url, InternalActions.Kind.RETRY), primary = true),
                Pages.Action(getString(R.string.error_back), actions.href(tab.id, url, InternalActions.Kind.BACK))
            ),
            Pages.Tone.NEUTRAL
        )
        renderPage(tab, url, title, html)
    }

    internal fun showCertificateError(tab: Tab, url: String) {
        tab.certErrorUrl = url
        val original = tab.upgrades[url]?.first
        if (original != null) {
            // Le site n'a pas de certificat valide en HTTPS : on propose plutôt le HTTP explicite.
            showInsecureWarning(tab, original)
            return
        }
        val title = getString(R.string.cert_heading)
        val html = Pages.message(
            getString(R.string.lang), title, title,
            getString(R.string.cert_message, UrlInput.displayHost(url)), url,
            listOf(Pages.Action(getString(R.string.error_back), actions.href(tab.id, url, InternalActions.Kind.BACK), primary = true)),
            Pages.Tone.DANGER
        )
        renderPage(tab, url, title, html)
    }

    private fun showInsecureWarning(tab: Tab, httpUrl: String) {
        val title = getString(R.string.insecure_heading)
        val html = Pages.message(
            getString(R.string.lang), title, title,
            getString(R.string.insecure_message, UrlInput.displayHost(httpUrl)), httpUrl,
            listOf(
                Pages.Action(getString(R.string.error_back), actions.href(tab.id, httpUrl, InternalActions.Kind.BACK), primary = true),
                Pages.Action(getString(R.string.insecure_continue), actions.href(tab.id, httpUrl, InternalActions.Kind.INSECURE))
            ),
            Pages.Tone.WARNING
        )
        renderPage(tab, httpUrl, title, html)
    }

    // ---------------------------------------------------------------- interface

    internal fun onTabChanged(tab: Tab) {
        if (tab === current) render()
    }

    private fun render() {
        val tab = current ?: return
        val hidden = privateLocked && tab.isPrivate
        if (!address.hasFocus()) address.setText(if (hidden) "" else tab.url, false)
        progress.progress = tab.progress
        progress.visibility = if (tab.progress in 1..99) View.VISIBLE else View.INVISIBLE
        tabsButton.text = if (tabs.size > 99) "∞" else tabs.size.toString()
        tabsButton.contentDescription = getString(R.string.tabs_desc, tabs.size)

        // Une teinte explicite dans les deux cas : `null` effacerait aussi celle du vecteur.
        val private = tab.isPrivate
        toolbar.setBackgroundColor(getColor(if (private) R.color.private_bar else R.color.surface))
        tabsButton.setTextColor(if (private) Color.WHITE else getColor(R.color.ink))
        menuButton.imageTintList = ColorStateList.valueOf(if (private) Color.WHITE else getColor(R.color.ink))
        shieldButton.imageTintList = ColorStateList.valueOf(if (private) Color.WHITE else getColor(R.color.acacia))
    }

    private fun showTabs() {
        val adapter = object : BaseAdapter() {
            override fun getCount() = tabs.size
            override fun getItem(position: Int) = tabs[position]
            override fun getItemId(position: Int) = tabs[position].id.toLong()
            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                val view = convertView ?: layoutInflater.inflate(R.layout.item_tab, parent, false)
                val tab = tabs[position]
                val label = tab.title.ifBlank { if (tab.url.isEmpty()) getString(R.string.tab_new) else UrlInput.displayHost(tab.url) }
                val title = view.findViewById<TextView>(R.id.tab_title)
                title.text = when {
                    tab.isPrivate && privateLocked -> getString(R.string.tab_private_prefix, getString(R.string.lock_hidden))
                    tab.isPrivate -> getString(R.string.tab_private_prefix, label)
                    else -> label
                }
                title.setTypeface(null, if (tab === current) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
                view.findViewById<TextView>(R.id.tab_url).text = if (tab.isPrivate && privateLocked) "" else tab.url
                val close = view.findViewById<ImageButton>(R.id.tab_close)
                close.isFocusable = false
                close.setOnClickListener {
                    closeTab(tab)
                    notifyDataSetChanged()
                }
                return view
            }
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.tabs_title)
            .setAdapter(adapter) { _, which -> tabs.getOrNull(which)?.let(::selectTab) }
            .setPositiveButton(R.string.menu_new_tab) { _, _ -> newTab(private = false) }
            .setNeutralButton(R.string.menu_new_private_tab) { _, _ -> newTab(private = true) }
            .show()
    }

    private fun showMenu(anchor: View) {
        val tab = current ?: return
        val popup = PopupMenu(this, anchor)
        val menu = popup.menu
        menu.add(0, M_NEW, 0, R.string.menu_new_tab)
        menu.add(0, M_PRIVATE, 1, R.string.menu_new_private_tab)
        if (tab.webView.canGoForward()) menu.add(0, M_FORWARD, 2, R.string.menu_forward)
        if (tab.progress in 1..99) menu.add(0, M_STOP, 3, R.string.menu_stop) else menu.add(0, M_RELOAD, 3, R.string.menu_reload)
        if (UrlInput.isHttp(tab.url)) menu.add(0, M_SHARE, 4, R.string.menu_share)
        menu.add(0, M_DESKTOP, 5, R.string.menu_desktop).setCheckable(true).isChecked = tab.desktopMode
        if (tabs.any { it.isPrivate }) menu.add(0, M_CLOSE_PRIVATE, 6, R.string.menu_close_private)
        if (UrlInput.isHttp(tab.url) && !tab.internalPage) {
            val marked = library.isBookmarked(tab.url)
            menu.add(0, M_BOOKMARK, 6, if (marked) R.string.menu_bookmark_remove else R.string.menu_bookmark_add)
        }
        if (imagesBlocked(tab) && UrlInput.isHttp(tab.url) && !tab.internalPage) menu.add(0, M_IMAGES, 4, R.string.menu_show_images)
        if (UrlInput.isHttp(tab.url) && !tab.internalPage) {
            menu.add(0, M_FIND, 5, R.string.menu_find)
            menu.add(0, M_READER, 5, R.string.menu_reader)
        }
        if (speaking) menu.add(0, M_SPEAK_STOP, 5, R.string.menu_speak_stop)
        else if (UrlInput.isHttp(tab.url) && (!tab.internalPage || tab.article != null)) menu.add(0, M_SPEAK, 5, R.string.menu_speak)
        if (!tab.isPrivate && UrlInput.isHttp(tab.url) && (!tab.internalPage || tab.article != null)) {
            menu.add(0, M_OFFLINE_SAVE, 6, R.string.menu_offline_save)
        }
        menu.add(0, M_OFFLINE_LIST, 6, R.string.menu_offline_list)
        menu.add(0, M_BOOKMARKS, 6, R.string.menu_bookmarks)
        menu.add(0, M_HISTORY, 6, R.string.menu_history)
        menu.add(0, M_CLEAR, 7, R.string.menu_clear_data)
        menu.add(0, M_SETTINGS, 8, R.string.menu_settings)
        popup.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                M_NEW -> newTab(private = false)
                M_PRIVATE -> newTab(private = true)
                M_FORWARD -> tab.webView.goForward()
                M_STOP -> tab.webView.stopLoading()
                M_RELOAD -> if (UrlInput.isHttp(tab.url) && tab.internalPage) load(tab, tab.url) else tab.webView.reload()
                M_SHARE -> share(tab.url)
                M_DESKTOP -> {
                    tab.desktopMode = !tab.desktopMode
                    applySettings(tab)
                    tab.webView.reload()
                }
                M_CLOSE_PRIVATE -> tabs.filter { it.isPrivate }.forEach(::closeTab)
                M_FIND -> showFind()
                M_IMAGES -> {
                    tab.forceImages = true
                    applySettings(tab)
                    tab.webView.reload()
                }
                M_READER -> openReader(tab)
                M_OFFLINE_SAVE -> saveOffline(tab)
                M_OFFLINE_LIST -> showOffline()
                M_SPEAK -> speak(tab)
                M_SPEAK_STOP -> stopSpeech()
                M_BOOKMARK -> toggleBookmark(tab)
                M_BOOKMARKS -> showBookmarks()
                M_HISTORY -> showHistory()
                M_CLEAR -> confirmClearData()
                M_SETTINGS -> showSettings()
            }
            true
        }
        popup.show()
    }

    private fun showShield() {
        val tab = current ?: return
        val lines = mutableListOf<String>()
        if (UrlInput.isHttp(tab.url) && !tab.internalPage) {
            lines += getString(if (tab.url.startsWith("https://", true)) R.string.shield_https else R.string.shield_http)
        }
        lines += getString(R.string.shield_blocked, tab.blocked.get())
        lines += getString(R.string.shield_popups, tab.popups.blocked)
        if (imagesBlocked(tab)) lines += getString(R.string.shield_images_blocked)
        savingsSummary()?.let { lines += it }
        val updated = filters.securityUpdatedAt
        lines += if (!settings.safeBrowsing) {
            getString(R.string.shield_lists_off)
        } else if (updated == 0L) {
            getString(R.string.shield_lists_pending)
        } else {
            getString(R.string.shield_lists_ready, DateUtils.getRelativeTimeSpanString(updated).toString())
        }
        AlertDialog.Builder(this)
            .setTitle(UrlInput.displayHost(tab.url).ifEmpty { getString(R.string.shield_desc) })
            .setMessage(lines.joinToString("\n\n"))
            .setPositiveButton(R.string.ok, null)
            .setNeutralButton(R.string.menu_settings) { _, _ -> showSettings() }
            .setNegativeButton(R.string.savings_price_button) { _, _ -> askDataPrice() }
            .show()
    }

    // ---------------------------------------------------------------- scripts de page

    private var cosmeticCache: Pair<Int, String> = -1 to ""

    /**
     * (Ré)injecte les scripts de début de document si la configuration a changé : masquage des
     * emplacements publicitaires et refus des cookies. Effet à partir du prochain chargement.
     */
    private fun refreshScripts(tab: Tab, webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        val hide = settings.adblock && settings.hideAdSlots
        val version = filters.cosmeticVersion
        val key = "$version|$hide|${settings.refuseCookies}"
        if (key == tab.scriptKey) return
        tab.scripts.forEach { it.remove() }
        val scripts = mutableListOf<String>()
        if (hide) {
            if (cosmeticCache.first != version) cosmeticCache = version to PageScripts.cosmetic(filters.cosmetic)
            cosmeticCache.second.takeIf { it.isNotEmpty() }?.let(scripts::add)
        }
        if (settings.refuseCookies) scripts += PageScripts.COOKIE_REFUSAL
        tab.scripts = scripts.map { WebViewCompat.addDocumentStartJavaScript(webView, it, setOf("*")) }
        tab.scriptKey = key
    }

    // ---------------------------------------------------------------- économies de données

    private fun thisMonth(): String = YearMonth.now().toString()

    /** « Ce mois-ci : 1 234 éléments bloqués, environ 18 Mo économisés (≈ 18 FCFA). » */
    private fun savingsSummary(): String? {
        val count = savings.snapshot(thisMonth()).second
        if (count <= 0) return null
        val locale = resources.configuration.locales[0]
        val bytes = Savings.bytes(count)
        val cost = Savings.formatCost(bytes, settings.dataPricePerGb, locale)?.let { getString(R.string.savings_cost, it) } ?: ""
        return getString(R.string.savings_line, NumberFormat.getIntegerInstance(locale).format(count), Savings.formatSize(bytes, locale), cost)
    }

    private fun persistSavings() {
        val (month, count) = savings.snapshot(thisMonth())
        getSharedPreferences(SAVINGS_PREFS, MODE_PRIVATE).edit().putString("month", month).putLong("count", count).apply()
    }

    private fun askDataPrice() {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = getString(R.string.savings_price_hint)
            if (settings.dataPricePerGb > 0) setText(settings.dataPricePerGb.toString())
        }
        val box = FrameLayout(this).apply { setPadding(pad, 0, pad, 0); addView(input) }
        AlertDialog.Builder(this)
            .setTitle(R.string.savings_price_title)
            .setMessage(getString(R.string.savings_price_help, Savings.currencySymbol(resources.configuration.locales[0])))
            .setView(box)
            .setPositiveButton(R.string.ok) { _, _ ->
                val price = input.text.toString().trim().toIntOrNull()?.coerceIn(0, 1_000_000) ?: 0
                updateSettings(settings.copy(dataPricePerGb = price))
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun share(url: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
        startActivity(Intent.createChooser(send, getString(R.string.share_title)))
    }

    private fun showSettings() {
        val labels = arrayOf(
            getString(R.string.set_adblock), getString(R.string.set_safe), getString(R.string.set_https),
            getString(R.string.set_cookies), getString(R.string.set_datasaver), getString(R.string.set_autoplay),
            getString(R.string.set_restore), getString(R.string.set_cookie_refuse), getString(R.string.set_hide_slots),
            getString(R.string.set_darken), getString(R.string.set_lock_private)
        )
        val s = settings
        val checked = booleanArrayOf(s.adblock, s.safeBrowsing, s.httpsOnly, s.blockThirdPartyCookies, s.dataSaver, s.autoplay, s.restoreSession, s.refuseCookies, s.hideAdSlots, s.darkenSites, s.lockPrivate)
        fun commit() {
            updateSettings(
                settings.copy(
                    adblock = checked[0], safeBrowsing = checked[1], httpsOnly = checked[2],
                    blockThirdPartyCookies = checked[3], dataSaver = checked[4], autoplay = checked[5],
                    restoreSession = checked[6], refuseCookies = checked[7], hideAdSlots = checked[8],
                    darkenSites = checked[9], lockPrivate = checked[10]
                )
            )
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_title)
            .setMultiChoiceItems(labels, checked) { _, which, isChecked -> checked[which] = isChecked }
            .setPositiveButton(R.string.ok) { _, _ -> commit() }
            .setNeutralButton(getString(R.string.settings_engine, s.searchEngine.label)) { _, _ ->
                commit()
                chooseSearchEngine()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun chooseSearchEngine() {
        val engines = SearchEngine.entries
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_engine_title)
            .setSingleChoiceItems(engines.map { it.label }.toTypedArray(), engines.indexOf(settings.searchEngine)) { dialog, which ->
                updateSettings(settings.copy(searchEngine = engines[which]))
                dialog.dismiss()
            }
            .show()
    }

    private fun updateSettings(next: Settings) {
        settings = next
        prefs.save(next)
        tabs.forEach(::applySettings)
        tabs.filter { it.hasWebView }.forEach { refreshScripts(it, it.webView) }
        saveSession()
    }

    private fun confirmClearData() {
        AlertDialog.Builder(this)
            .setTitle(R.string.clear_title)
            .setMessage(R.string.clear_message)
            .setPositiveButton(R.string.clear_confirm) { _, _ -> clearBrowsingData() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun clearBrowsingData() {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        WebStorage.getInstance().deleteAllData()
        GeolocationPermissions.getInstance().clearAll()
        WebViewDatabase.getInstance(this).clearHttpAuthUsernamePassword()
        current?.webView?.clearCache(true)
        for (tab in tabs) if (tab.hasWebView) tab.webView.clearFormData()
        library.clearHistory()
        toast(R.string.cleared)
    }

    // ---------------------------------------------------------------- mode lecture et voix

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speaking = false
    private var pendingSpeech: Article? = null
    private var lastUtterance = ""

    private fun readerLabels(note: String? = null) = Reader.Labels(
        getString(R.string.lang), getString(R.string.reader_original),
        { getString(R.string.reader_minutes, it) }, note
    )

    /** Article de la page : celui déjà extrait (page de lecture) ou extrait maintenant. */
    private fun extractArticle(tab: Tab, then: (Article?) -> Unit) {
        val known = tab.article
        if (known != null && tab.internalPage) {
            then(known)
            return
        }
        if (!UrlInput.isHttp(tab.url) || tab.internalPage) {
            then(null)
            return
        }
        val url = tab.url
        tab.webView.evaluateJavascript(Reader.EXTRACT_JS) { raw -> then(parseArticle(url, raw)) }
    }

    private fun parseArticle(url: String, raw: String?): Article? = try {
        val text = JSONTokener(raw ?: "null").nextValue() as? String
        if (text == null) {
            null
        } else {
            val json = JSONObject(text)
            val array = json.getJSONArray("blocks")
            val blocks = (0 until array.length()).mapNotNull { i ->
                val item = array.optJSONArray(i) ?: return@mapNotNull null
                val kind = item.optString(0, "p").firstOrNull()?.takeIf { it in "hplq" } ?: 'p'
                item.optString(1).trim().takeIf { it.isNotEmpty() }?.let { Block(kind, it.take(5000)) }
            }.take(600).let(Reader::clean)
            if (blocks.isEmpty()) null
            else Article(url, json.optString("title").trim().ifEmpty { UrlInput.displayHost(url) }.take(300), json.optString("lang"), blocks)
        }
    } catch (_: Exception) {
        null
    }

    private fun openReader(tab: Tab) {
        extractArticle(tab) { article ->
            if (article == null) {
                toast(R.string.reader_unavailable)
            } else {
                tab.article = article
                renderPage(tab, article.url, article.title, Reader.html(article, readerLabels()))
            }
        }
    }

    private fun speak(tab: Tab) {
        extractArticle(tab) { article -> if (article == null) toast(R.string.reader_unavailable) else startSpeech(article) }
    }

    private fun startSpeech(article: Article) {
        val engine = tts
        if (engine == null || !ttsReady) {
            pendingSpeech = article
            if (engine == null) {
                tts = TextToSpeech(this) { status ->
                    runOnUiThread {
                        if (status == TextToSpeech.SUCCESS) {
                            ttsReady = true
                            pendingSpeech?.let(::startSpeech)
                        } else {
                            tts = null
                            toast(R.string.tts_unavailable)
                        }
                        pendingSpeech = null
                    }
                }
            }
            return
        }
        val deviceLocale = resources.configuration.locales[0]
        val locale = article.lang.takeIf { it.isNotBlank() }?.let(Locale::forLanguageTag) ?: deviceLocale
        val result = engine.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            toast(R.string.tts_voice_missing)
            engine.setLanguage(deviceLocale)
        }
        val chunks = Reader.speechChunks(article, minOf(3000, TextToSpeech.getMaxSpeechInputLength() - 1))
        lastUtterance = "zuri-${chunks.size - 1}"
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) {
                if (utteranceId == lastUtterance) runOnUiThread { speaking = false }
            }
            @Deprecated("Remplacé par onError(String, Int)")
            override fun onError(utteranceId: String?) {
                runOnUiThread { speaking = false }
            }
        })
        chunks.forEachIndexed { i, chunk ->
            engine.speak(chunk, if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, "zuri-$i")
        }
        speaking = true
        toast(R.string.tts_started)
    }

    private fun stopSpeech() {
        tts?.stop()
        speaking = false
    }

    // ---------------------------------------------------------------- verrouillage des onglets privés

    /** Onglets privés masqués tant que l'utilisateur ne s'est pas authentifié (après une sortie). */
    private var privateLocked = false
    private var lockCover: View? = null
    private var authenticating = false

    private fun lockIfNeeded() {
        if (settings.lockPrivate && tabs.any { it.isPrivate }) privateLocked = true
    }

    /** Affiche le cache et demande l'empreinte ou le code si l'onglet privé est verrouillé. */
    private fun guardPrivate(tab: Tab) {
        if (!privateLocked || !tab.isPrivate) {
            hideLockCover()
            return
        }
        showLockCover()
        if (!authenticating) authenticate()
    }

    private fun showLockCover() {
        if (lockCover != null) return
        val pad = (24 * resources.displayMetrics.density).toInt()
        val cover = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(getColor(R.color.private_bar))
            setPadding(pad, pad, pad, pad)
            isClickable = true
            addView(TextView(context).apply {
                text = getString(R.string.lock_cover)
                setTextColor(Color.WHITE)
                textSize = 17f
                gravity = android.view.Gravity.CENTER
            })
            addView(android.widget.Button(context).apply {
                text = getString(R.string.lock_unlock)
                setOnClickListener { authenticate() }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = pad })
        }
        content.addView(cover, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        lockCover = cover
        render()
    }

    private fun hideLockCover() {
        lockCover?.let { content.removeView(it) }
        lockCover = null
    }

    private fun unlocked() {
        authenticating = false
        privateLocked = false
        hideLockCover()
        render()
    }

    /** Empreinte, visage ou code du téléphone ; sans verrouillage d'écran, rien à protéger. */
    private fun authenticate() {
        val keyguard = getSystemService(android.app.KeyguardManager::class.java)
        if (keyguard == null || !keyguard.isDeviceSecure) {
            toast(R.string.lock_no_screen_lock)
            unlocked()
            return
        }
        authenticating = true
        if (Build.VERSION.SDK_INT >= 30) {
            val prompt = android.hardware.biometrics.BiometricPrompt.Builder(this)
                .setTitle(getString(R.string.lock_title))
                .setSubtitle(getString(R.string.lock_subtitle))
                .setAllowedAuthenticators(
                    android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_WEAK or
                        android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
                .build()
            prompt.authenticate(android.os.CancellationSignal(), mainExecutor,
                object : android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: android.hardware.biometrics.BiometricPrompt.AuthenticationResult) = unlocked()
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        authenticating = false
                    }
                })
        } else {
            @Suppress("DEPRECATION")
            val intent = keyguard.createConfirmDeviceCredentialIntent(getString(R.string.lock_title), getString(R.string.lock_subtitle))
            if (intent == null) {
                unlocked()
            } else {
                @Suppress("DEPRECATION")
                startActivityForResult(intent, REQUEST_UNLOCK)
            }
        }
    }

    // ---------------------------------------------------------------- économiseur de données

    private fun imagesBlocked(tab: Tab) = settings.dataSaver && metered && !tab.forceImages

    /** Suit le réseau actif : les images reviennent dès le passage en Wi-Fi, et inversement. */
    private fun watchNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        metered = manager.isActiveNetworkMetered
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                val now = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                if (now != metered) {
                    metered = now
                    runOnUiThread { tabs.forEach { applySettings(it) } }
                }
            }
        }
        try {
            manager.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (_: RuntimeException) {
            // Trop de rappels enregistrés ou service indisponible : on garde l'état initial.
        }
    }

    // ---------------------------------------------------------------- recherche dans la page

    private fun setupFindBar() {
        findInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                val tab = current ?: return
                val query = s?.toString().orEmpty()
                if (query.isEmpty()) {
                    tab.webView.clearMatches()
                    findCount.text = ""
                } else {
                    tab.webView.findAllAsync(query)
                }
            }
        })
        findInput.setOnEditorActionListener { _, _, _ ->
            current?.webView?.findNext(true)
            true
        }
        findViewById<View>(R.id.find_next).setOnClickListener { current?.webView?.findNext(true) }
        findViewById<View>(R.id.find_prev).setOnClickListener { current?.webView?.findNext(false) }
        findViewById<View>(R.id.find_close).setOnClickListener { hideFind() }
    }

    private fun showFind() {
        findBar.visibility = View.VISIBLE
        findInput.setText("")
        findCount.text = ""
        findInput.requestFocus()
        findInput.post { getSystemService(InputMethodManager::class.java)?.showSoftInput(findInput, InputMethodManager.SHOW_IMPLICIT) }
    }

    private fun hideFind() {
        findBar.visibility = View.GONE
        current?.let { if (it.hasWebView) it.webView.clearMatches() }
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(findInput.windowToken, 0)
    }

    // ---------------------------------------------------------------- favoris et historique

    internal fun onPageLoaded(tab: Tab) {
        if (!tab.isPrivate && !tab.internalPage && UrlInput.isHttp(tab.url)) {
            library.recordVisit(tab.url, tab.title, System.currentTimeMillis())
        }
    }

    internal fun onTitle(tab: Tab) {
        if (!tab.isPrivate && !tab.internalPage) library.updateTitle(tab.url, tab.title)
    }

    private fun toggleBookmark(tab: Tab) {
        val added = library.toggleBookmark(tab.url, tab.title, System.currentTimeMillis())
        toast(if (added) R.string.bookmark_added else R.string.bookmark_removed)
    }

    /** Liste de favoris ou d'historique : un appui ouvre la page, la croix la supprime. */
    private fun showEntries(
        titleRes: Int,
        emptyRes: Int,
        load: () -> List<Pair<String, String>>,
        remove: (String) -> Unit,
        neutral: Pair<Int, () -> Unit>? = null,
        open: (String) -> Unit = { url -> current?.let { load(it, url) } }
    ) {
        var entries = load()
        if (entries.isEmpty()) {
            AlertDialog.Builder(this).setTitle(titleRes).setMessage(emptyRes).setPositiveButton(R.string.ok, null).show()
            return
        }
        val adapter = object : BaseAdapter() {
            override fun getCount() = entries.size
            override fun getItem(position: Int) = entries[position]
            override fun getItemId(position: Int) = position.toLong()
            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                val view = convertView ?: layoutInflater.inflate(R.layout.item_tab, parent, false)
                val (url, title) = entries[position]
                view.findViewById<TextView>(R.id.tab_title).text = title.ifBlank { UrlInput.displayHost(url) }
                view.findViewById<TextView>(R.id.tab_url).text = url
                val delete = view.findViewById<ImageButton>(R.id.tab_close)
                delete.contentDescription = getString(R.string.delete)
                delete.isFocusable = false
                delete.setOnClickListener {
                    remove(url)
                    entries = load()
                    notifyDataSetChanged()
                }
                return view
            }
        }
        val builder = AlertDialog.Builder(this)
            .setTitle(titleRes)
            .setAdapter(adapter) { _, which -> entries.getOrNull(which)?.let { (url, _) -> open(url) } }
            .setPositiveButton(R.string.ok, null)
        neutral?.let { (label, action) -> builder.setNeutralButton(label) { _, _ -> action() } }
        builder.show()
    }

    private fun saveOffline(tab: Tab) {
        if (tab.isPrivate) {
            toast(R.string.offline_private)
            return
        }
        extractArticle(tab) { article ->
            if (article == null) {
                toast(R.string.reader_unavailable)
            } else {
                tab.article = article
                shelf.save(article.copy(savedAt = System.currentTimeMillis()))
                toast(R.string.offline_saved)
            }
        }
    }

    private fun showOffline() = showEntries(
        R.string.menu_offline_list, R.string.offline_empty,
        { shelf.list().map { it.url to it.title } }, shelf::remove,
        open = { url ->
            val tab = current
            val article = shelf.get(url)
            if (tab != null && article != null) {
                val date = DateUtils.formatDateTime(this, article.savedAt, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR)
                tab.article = article
                renderPage(tab, article.url, article.title, Reader.html(article, readerLabels(getString(R.string.offline_note, date))))
            }
        }
    )

    private fun showBookmarks() = showEntries(
        R.string.menu_bookmarks, R.string.bookmarks_empty,
        { library.bookmarks().map { it.url to it.title } }, library::removeBookmark
    )

    private fun showHistory() = showEntries(
        R.string.menu_history, R.string.history_empty,
        { library.history().map { it.url to it.title } }, library::removeVisit,
        R.string.history_clear to {
            AlertDialog.Builder(this)
                .setTitle(R.string.history_clear)
                .setMessage(R.string.history_clear_message)
                .setPositiveButton(R.string.clear_confirm) { _, _ -> library.clearHistory() }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }
    )

    /** Suggestions locales sous la barre d'adresse (favoris puis historique). */
    private inner class SuggestionAdapter : BaseAdapter(), Filterable {
        private var items: List<Suggestion> = emptyList()

        override fun getCount() = items.size
        override fun getItem(position: Int) = items[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = convertView ?: layoutInflater.inflate(R.layout.item_suggestion, parent, false)
            val item = items[position]
            view.findViewById<TextView>(R.id.suggestion_title).text =
                (if (item.bookmarked) "★ " else "") + item.title.ifBlank { UrlInput.displayHost(item.url) }
            view.findViewById<TextView>(R.id.suggestion_url).text = item.url
            return view
        }

        override fun getFilter() = object : Filter() {
            override fun performFiltering(constraint: CharSequence?): FilterResults {
                val found = library.suggest(constraint?.toString().orEmpty())
                return FilterResults().apply { values = found; count = found.size }
            }

            @Suppress("UNCHECKED_CAST")
            override fun publishResults(constraint: CharSequence?, results: FilterResults?) {
                items = (results?.values as? List<Suggestion>).orEmpty()
                if (items.isEmpty()) notifyDataSetInvalidated() else notifyDataSetChanged()
            }

            override fun convertResultToString(resultValue: Any?): CharSequence = (resultValue as? Suggestion)?.url ?: ""
        }
    }

    // ---------------------------------------------------------------- services de la page

    internal fun askHttpAuth(handler: HttpAuthHandler, host: String, realm: String) {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val user = EditText(this).apply { hint = getString(R.string.auth_user); inputType = InputType.TYPE_CLASS_TEXT }
        val password = EditText(this).apply {
            hint = getString(R.string.auth_password)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, 0, pad, 0)
            addView(user)
            addView(password)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.auth_title)
            .setMessage(getString(R.string.auth_message, host, realm))
            .setView(form)
            .setPositiveButton(R.string.auth_login) { _, _ -> handler.proceed(user.text.toString(), password.text.toString()) }
            .setNegativeButton(R.string.cancel) { _, _ -> handler.cancel() }
            .setOnCancelListener { handler.cancel() }
            .show()
    }

    /**
     * Caméra, micro, contenus protégés : refus par défaut, question à l'utilisateur, choix retenu
     * pour la session seulement (et séparément pour les onglets privés).
     */
    internal fun onPermissionRequest(tab: Tab, request: PermissionRequest) {
        val origin = request.origin.toString().trimEnd('/')
        val wanted = request.resources.filter {
            it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE ||
                it == PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID
        }
        if (wanted.isEmpty() || !origin.startsWith("https://", true) && !isLocalOrigin(origin)) {
            request.deny()
            return
        }
        val keys = wanted.map { permissionKey(tab, origin, it) }
        if (keys.all { sitePermissions[it] == true }) {
            grantWithRuntime(request, wanted)
            return
        }
        if (keys.any { sitePermissions[it] == false }) {
            request.deny()
            return
        }
        val labels = wanted.map {
            getString(
                when (it) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> R.string.perm_camera
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> R.string.perm_mic
                    else -> R.string.perm_drm
                }
            )
        }
        permissionDialog?.dismiss()
        permissionDialogRequest = request
        permissionDialog = AlertDialog.Builder(this)
            .setTitle(R.string.perm_title)
            .setMessage(getString(R.string.perm_message, UrlInput.displayHost(origin), labels.joinToString(", ")))
            .setPositiveButton(R.string.perm_allow) { _, _ ->
                keys.forEach { sitePermissions[it] = true }
                grantWithRuntime(request, wanted)
            }
            .setNegativeButton(R.string.perm_block) { _, _ ->
                keys.forEach { sitePermissions[it] = false }
                request.deny()
            }
            .setOnCancelListener { request.deny() }
            .setOnDismissListener { if (permissionDialogRequest === request) permissionDialogRequest = null }
            .show()
    }

    internal fun onPermissionCanceled(request: PermissionRequest) {
        if (permissionDialogRequest === request) {
            permissionDialogRequest = null
            permissionDialog?.dismiss()
        }
    }

    private fun grantWithRuntime(request: PermissionRequest, resources: List<String>) {
        val runtime = buildList {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in resources) add(Manifest.permission.CAMERA)
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in resources) add(Manifest.permission.RECORD_AUDIO)
        }
        withRuntimePermissions(runtime) { granted ->
            if (granted) request.grant(resources.toTypedArray()) else request.deny()
        }
    }

    internal fun onGeolocationRequest(tab: Tab, origin: String, callback: GeolocationPermissions.Callback) {
        val key = permissionKey(tab, origin.trimEnd('/'), "geolocation")
        val respond = { allowed: Boolean ->
            if (!allowed) {
                callback.invoke(origin, false, false)
            } else {
                val location = listOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)
                // retain = false : rien n'est mémorisé par la WebView elle-même.
                withRuntimePermissions(location, anyOf = true) { callback.invoke(origin, it, false) }
            }
        }
        val decided = sitePermissions[key]
        if (decided != null) {
            respond(decided)
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.perm_title)
            .setMessage(getString(R.string.perm_message, UrlInput.displayHost(origin), getString(R.string.perm_location)))
            .setPositiveButton(R.string.perm_allow) { _, _ ->
                sitePermissions[key] = true
                respond(true)
            }
            .setNegativeButton(R.string.perm_block) { _, _ ->
                sitePermissions[key] = false
                respond(false)
            }
            .setOnCancelListener { respond(false) }
            .show()
    }

    private fun permissionKey(tab: Tab, origin: String, resource: String) = "${tab.isPrivate}|$origin|$resource"

    private fun isLocalOrigin(origin: String): Boolean {
        val host = UrlInput.hostOf(origin)
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    /** Demande les autorisations Android manquantes, puis rappelle avec le résultat. */
    private fun withRuntimePermissions(permissions: List<String>, anyOf: Boolean = false, then: (Boolean) -> Unit) {
        val missing = permissions.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty() || anyOf && missing.size < permissions.size) {
            then(true)
            return
        }
        pendingPermissions?.invoke(false)
        pendingPermissions = then
        permissionsAnyOf = anyOf
        requestPermissions(missing.toTypedArray(), REQUEST_PERMISSIONS)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_PERMISSIONS) return
        val callback = pendingPermissions ?: return
        pendingPermissions = null
        val results = grantResults.map { it == PackageManager.PERMISSION_GRANTED }
        callback(results.isNotEmpty() && if (permissionsAnyOf) results.any { it } else results.all { it })
    }

    // ---------------------------------------------------------------- téléchargements

    private fun onDownload(tab: Tab, url: String, userAgent: String?, disposition: String?, mime: String?, length: Long) {
        if (!UrlInput.isHttp(url)) {
            toast(R.string.download_unsupported)
            return
        }
        val name = FileSafety.sanitize(URLUtil.guessFileName(url, disposition, mime))
        val details = buildString {
            append(getString(R.string.download_from, UrlInput.displayHost(url)))
            FileSafety.formatSize(length)?.let { append(" · ").append(it) }
            if (FileSafety.isDangerous(name)) append("\n\n").append(getString(R.string.download_danger))
            if (tab.isPrivate) append("\n\n").append(getString(R.string.download_private_note))
        }
        AlertDialog.Builder(this)
            .setTitle(name)
            .setMessage(details)
            .setPositiveButton(R.string.download_confirm) { _, _ -> startDownload(tab, url, userAgent, mime, name) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun startDownload(tab: Tab, url: String, userAgent: String?, mime: String?, name: String) {
        if (Build.VERSION.SDK_INT < 29) {
            val permission = Manifest.permission.WRITE_EXTERNAL_STORAGE
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                withRuntimePermissions(listOf(permission)) { if (it) startDownload(tab, url, userAgent, mime, name) }
                return
            }
        }
        try {
            val request = DownloadManager.Request(url.toUri())
                .setTitle(name)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            if (!mime.isNullOrBlank()) request.setMimeType(mime)
            request.addRequestHeader("User-Agent", userAgent ?: userAgent(tab.desktopMode))
            // Les cookies du bon profil (privé ou non) pour les fichiers derrière une connexion.
            cookieManagerFor(tab).getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
            getSystemService(DownloadManager::class.java).enqueue(request)
            Toast.makeText(this, getString(R.string.download_started, name), Toast.LENGTH_SHORT).show()
        } catch (_: IllegalArgumentException) {
            toast(R.string.download_unsupported)
        } catch (_: IllegalStateException) {
            toast(R.string.download_unsupported)
        } catch (_: SecurityException) {
            toast(R.string.download_unsupported)
        }
    }

    // ---------------------------------------------------------------- navigation privée

    /** Efface tout ce que le profil privé a pu conserver, puis supprime le profil s'il est libre. */
    private fun clearPrivateData(atStartup: Boolean = false) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) return
        val store = ProfileStore.getInstance()
        val profile = store.getProfile(PRIVATE_PROFILE) ?: return
        sitePermissions.keys.removeAll { it.startsWith("true|") }
        // Au démarrage, le moteur n'est pas encore initialisé : la suppression du profil suffit
        // (aucune WebView ne l'utilise) et efface ses données sur le disque.
        if (!atStartup) {
            try {
                profile.cookieManager.removeAllCookies(null)
                profile.webStorage.deleteAllData()
                profile.geolocationPermissions.clearAll()
            } catch (_: RuntimeException) {
                // Moteur indisponible : la suppression du profil ci-dessous reste tentée.
            }
        }
        try {
            store.deleteProfile(PRIVATE_PROFILE)
        } catch (_: IllegalStateException) {
            // Encore référencé par une WebView en cours de destruction : déjà vidé ci-dessus.
        } catch (_: IllegalArgumentException) {
            // Profil déjà supprimé.
        }
    }

    internal fun showFileChooser(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        val intent = params.createIntent()
        if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        return try {
            @Suppress("DEPRECATION")
            startActivityForResult(intent, REQUEST_FILE)
            true
        } catch (_: ActivityNotFoundException) {
            fileCallback = null
            false
        }
    }

    internal fun showCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (customView != null) {
            callback.onCustomViewHidden()
            return
        }
        customView = view
        customViewCallback = callback
        view.setBackgroundColor(Color.BLACK)
        (window.decorView as FrameLayout).addView(
            view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    internal fun hideCustomView() {
        val view = customView ?: return
        (window.decorView as FrameLayout).removeView(view)
        customView = null
        WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
    }

    // ---------------------------------------------------------------- utilitaires

    private fun toast(res: Int) = Toast.makeText(this, res, Toast.LENGTH_SHORT).show()

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(address.windowToken, 0)
    }

    private fun showKeyboard() {
        address.post { getSystemService(InputMethodManager::class.java)?.showSoftInput(address, InputMethodManager.SHOW_IMPLICIT) }
    }

    private companion object {
        @Volatile private var filterLists: FilterLists? = null

        /** Une seule instance par processus, partagée si l'activité est recréée. */
        const val SAVINGS_PREFS = "economies"
        @Volatile private var savingsCounter: SavingsCounter? = null

        fun sharedSavings(activity: Activity): SavingsCounter =
            savingsCounter ?: synchronized(this) {
                savingsCounter ?: activity.getSharedPreferences(SAVINGS_PREFS, MODE_PRIVATE).let { prefs ->
                    SavingsCounter(prefs.getString("month", "").orEmpty(), prefs.getLong("count", 0))
                }.also { savingsCounter = it }
            }

        fun sharedFilters(activity: Activity): FilterLists =
            filterLists ?: synchronized(this) {
                filterLists ?: FilterLists(activity).also {
                    it.start()
                    filterLists = it
                }
            }

        const val PRIVATE_PROFILE = "zuri-prive"
        const val REQUEST_PERMISSIONS = 2
        const val REQUEST_UNLOCK = 3
        const val UNSAFE_ALLOW_MS = 10 * 60 * 1000L
        const val REQUEST_FILE = 1
        const val LOOP_WINDOW_MS = 15_000L
        const val M_NEW = 1
        const val M_PRIVATE = 2
        const val M_FORWARD = 3
        const val M_RELOAD = 4
        const val M_STOP = 5
        const val M_SHARE = 6
        const val M_DESKTOP = 7
        const val M_CLOSE_PRIVATE = 8
        const val M_CLEAR = 9
        const val M_SETTINGS = 10
        const val M_BOOKMARK = 11
        const val M_BOOKMARKS = 12
        const val M_HISTORY = 13
        const val M_FIND = 14
        const val M_READER = 15
        const val M_SPEAK = 16
        const val M_SPEAK_STOP = 17
        const val M_OFFLINE_SAVE = 18
        const val M_OFFLINE_LIST = 19
        const val M_IMAGES = 20
    }
}
