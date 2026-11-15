package af.zuri.browser

import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Message
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.HttpAuthHandler
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.Locale

/** Navigation d'un onglet : schémas autorisés, HTTPS-only, erreurs, plantage du moteur. */
class ZuriWebViewClient(private val host: BrowserActivity, private val tab: Tab) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return true
        if (!request.isForMainFrame) {
            // Cadres : uniquement le web ; jamais d'ouverture d'application depuis un iframe.
            return scheme !in FRAME_SCHEMES
        }
        return when (scheme) {
            "https" -> {
                tab.loadingUrl = uri.toString()
                false
            }
            "http" -> host.onHttpNavigation(tab, uri.toString(), request.isRedirect)
            "zuri" -> {
                host.onInternalLink(tab, uri)
                true
            }
            "about" -> false
            // Schémas locaux ou dangereux : jamais depuis une page web.
            "javascript", "file", "content", "data", "blob", "filesystem", "chrome", "view-source" -> true
            else -> {
                host.openExternal(tab, uri, request.hasGesture())
                true
            }
        }
    }

    /** Fil réseau : blocage des sites signalés, des publicités et des traqueurs. */
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        host.intercept(tab, request)

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        if (UrlInput.isHttp(url)) {
            tab.internalPage = false
            tab.url = url
            tab.pageUrl = url
            tab.blocked.set(0)
            tab.popups.reset()
        }
        host.onTabChanged(tab)
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        // Navigation interne des applications web (history.pushState).
        if (UrlInput.isHttp(url) && !tab.internalPage) {
            tab.url = url
            tab.pageUrl = url
            host.onTabChanged(tab)
        }
    }

    override fun onPageFinished(view: WebView, url: String) {
        tab.progress = 100
        host.onPageLoaded(tab)
        host.onTabChanged(tab)
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (!request.isForMainFrame) return
        host.showLoadError(tab, request.url.toString(), error.errorCode, error.description?.toString().orEmpty())
    }

    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        // Aucun contournement possible : un certificat invalide arrête toujours le chargement.
        handler.cancel()
        if (error.url == tab.loadingUrl || error.url == tab.pageUrl) host.showCertificateError(tab, error.url)
    }

    override fun onReceivedHttpAuthRequest(view: WebView, handler: HttpAuthHandler, hostName: String, realm: String) {
        host.askHttpAuth(handler, hostName, realm)
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        host.onRendererGone(tab)
        return true
    }

    private companion object {
        val FRAME_SCHEMES = setOf("http", "https", "about", "data", "blob")
    }
}

/** Interface du navigateur côté page : progression, titres, popups, plein écran, autorisations. */
class ZuriChromeClient(private val host: BrowserActivity, private val tab: Tab) : WebChromeClient() {

    override fun onProgressChanged(view: WebView, newProgress: Int) {
        tab.progress = newProgress
        host.onTabChanged(tab)
    }

    override fun onReceivedTitle(view: WebView, title: String?) {
        if (!tab.internalPage) {
            tab.title = title.orEmpty()
            host.onTitle(tab)
            host.onTabChanged(tab)
        }
    }

    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean =
        host.openPopup(tab, isUserGesture, resultMsg)

    override fun onCloseWindow(window: WebView) {
        host.closeTab(tab)
    }

    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
        host.showCustomView(view, callback)
    }

    override fun onHideCustomView() {
        host.hideCustomView()
    }

    override fun onPermissionRequest(request: PermissionRequest) {
        host.onPermissionRequest(tab, request)
    }

    override fun onPermissionRequestCanceled(request: PermissionRequest) {
        host.onPermissionCanceled(request)
    }

    override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
        host.onGeolocationRequest(tab, origin, callback)
    }

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams
    ): Boolean = host.showFileChooser(filePathCallback, fileChooserParams)
}
