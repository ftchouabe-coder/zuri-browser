package af.zuri.browser

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.os.SystemClock
import android.text.InputType
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
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewDatabase
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream
import java.net.URISyntaxException
import java.util.Locale

class BrowserActivity : Activity() {

    private lateinit var prefs: Prefs
    /** Lu aussi depuis le fil réseau de la WebView (interception des requêtes). */
    @Volatile internal var settings = Settings()
        private set
    private val filters: FilterLists by lazy { sharedFilters(this) }

    private lateinit var root: View
    private lateinit var toolbar: View
    private lateinit var address: EditText
    private lateinit var tabsButton: TextView
    private lateinit var menuButton: ImageButton
    private lateinit var shieldButton: ImageButton
    private lateinit var progress: ProgressBar
    private lateinit var content: FrameLayout

    private val tabs = mutableListOf<Tab>()
    private var current: Tab? = null
    private var nextTabId = 1
    private val actions = InternalActions()

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

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
        tabsButton.setOnClickListener { showTabs() }
        menuButton.setOnClickListener { showMenu(it) }
        shieldButton.setOnClickListener { showShield() }

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        registerBackHandler()
        filters // chargement des listes en tâche de fond

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
    }

    override fun onPause() {
        super.onPause()
        saveSession()
        current?.webView?.onPause()
        current?.webView?.pauseTimers()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        for (tab in tabs) destroyWebView(tab)
        tabs.clear()
        super.onDestroy()
    }

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
        val webView = WebView(this)
        val tab = Tab(nextTabId++, private, webView, parentId)
        configure(tab)
        webView.webViewClient = ZuriWebViewClient(this, tab)
        webView.webChromeClient = ZuriChromeClient(this, tab)

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
        if (foreground) selectTab(tab) else webView.onPause()
        render()
        return tab
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configure(tab: Tab) {
        val s = tab.webView.settings
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
        // Sans cela, chaque requête annonce le nom du paquet (X-Requested-With) aux sites.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(s, emptySet())
        }
        applySettings(tab)
    }

    private fun applySettings(tab: Tab) {
        val s = tab.webView.settings
        s.safeBrowsingEnabled = settings.safeBrowsing
        s.mediaPlaybackRequiresUserGesture = !settings.autoplay
        s.blockNetworkImage = settings.dataSaver
        s.userAgentString = userAgent(tab.desktopMode)
        cookieManagerFor(tab).setAcceptThirdPartyCookies(tab.webView, !settings.blockThirdPartyCookies)
    }

    private fun cookieManagerFor(@Suppress("UNUSED_PARAMETER") tab: Tab): CookieManager = CookieManager.getInstance()

    /** Agent utilisateur de Chrome : sans le marqueur « wv », certains sites dégradent l'affichage. */
    private fun userAgent(desktop: Boolean): String {
        val base = WebSettings.getDefaultUserAgent(this)
        if (!desktop) return base.replace("; wv)", ")").replace(" Version/4.0", "")
        val major = Regex("Chrome/(\\d+)").find(base)?.groupValues?.get(1) ?: "130"
        return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$major.0.0.0 Safari/537.36"
    }

    private fun selectTab(tab: Tab) {
        val previous = current
        if (previous != null && previous !== tab) {
            previous.webView.onPause()
            content.removeView(previous.webView)
        }
        current = tab
        if (tab.webView.parent == null) {
            content.addView(tab.webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        tab.webView.onResume()
        tab.pendingUrl?.let { load(tab, it) }
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
        if (current === tab) {
            current = null
            val next = tabs.firstOrNull { it.id == tab.parentId } ?: tabs.getOrNull(index.coerceAtMost(tabs.size - 1))
            if (next != null) selectTab(next) else newTab(private = false)
        }
        render()
    }

    private fun destroyWebView(tab: Tab) {
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
                    return if (request.isForMainFrame) threatResponse(tab, url, host, threat) else emptyResponse()
                }
            }
        }
        if (config.adblock && !request.isForMainFrame && filters.ads.matches(host, url)) {
            val pageHost = UrlInput.hostOf(tab.pageUrl)
            if (pageHost == null || DomainSet.siteOf(pageHost) != DomainSet.siteOf(host)) {
                tab.blocked.incrementAndGet()
                return emptyResponse()
            }
        }
        return null
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
        renderPage(tab, null, title, Pages.start(getString(R.string.lang), title, getString(R.string.start_tagline), note))
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
        if (!address.hasFocus()) address.setText(tab.url)
        progress.progress = tab.progress
        progress.visibility = if (tab.progress in 1..99) View.VISIBLE else View.INVISIBLE
        tabsButton.text = if (tabs.size > 99) "∞" else tabs.size.toString()
        tabsButton.contentDescription = getString(R.string.tabs_desc, tabs.size)

        val tint = if (tab.isPrivate) ColorStateList.valueOf(Color.WHITE) else null
        toolbar.setBackgroundColor(getColor(if (tab.isPrivate) R.color.private_bar else R.color.surface))
        tabsButton.setTextColor(if (tab.isPrivate) Color.WHITE else getColor(R.color.ink))
        menuButton.imageTintList = tint
        shieldButton.imageTintList = tint
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
                title.text = if (tab.isPrivate) getString(R.string.tab_private_prefix, label) else label
                title.setTypeface(null, if (tab === current) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
                view.findViewById<TextView>(R.id.tab_url).text = tab.url
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
            getString(R.string.set_restore)
        )
        val s = settings
        val checked = booleanArrayOf(s.adblock, s.safeBrowsing, s.httpsOnly, s.blockThirdPartyCookies, s.dataSaver, s.autoplay, s.restoreSession)
        fun commit() {
            updateSettings(
                settings.copy(
                    adblock = checked[0], safeBrowsing = checked[1], httpsOnly = checked[2],
                    blockThirdPartyCookies = checked[3], dataSaver = checked[4], autoplay = checked[5],
                    restoreSession = checked[6]
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
        for (tab in tabs) tab.webView.clearFormData()
        toast(R.string.cleared)
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

    internal fun onPermissionRequest(tab: Tab, request: PermissionRequest) {
        request.deny()
    }

    internal fun onPermissionCanceled(request: PermissionRequest) = Unit

    internal fun onGeolocationRequest(tab: Tab, origin: String, callback: GeolocationPermissions.Callback) {
        callback.invoke(origin, false, false)
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
        fun sharedFilters(activity: Activity): FilterLists =
            filterLists ?: synchronized(this) {
                filterLists ?: FilterLists(activity).also {
                    it.start()
                    filterLists = it
                }
            }

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
    }
}
