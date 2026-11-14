package af.zuri.browser

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView

class BrowserActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(WebView(this).apply { loadUrl("about:blank") })
    }
}
