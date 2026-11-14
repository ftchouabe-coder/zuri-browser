package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlInputTest {
    private val ddg = SearchEngine.DUCKDUCKGO

    @Test
    fun adressesWeb() {
        assertEquals("https://example.com", UrlInput.toNavigableUrl("example.com"))
        assertEquals("https://example.com/a?b=1", UrlInput.toNavigableUrl("  example.com/a?b=1 "))
        assertEquals("https://example.com:8443", UrlInput.toNavigableUrl("example.com:8443"))
        assertEquals("http://example.com", UrlInput.toNavigableUrl("http://example.com"))
        assertEquals("HTTPS://Example.com/x", UrlInput.toNavigableUrl("HTTPS://Example.com/x"))
        assertEquals("http://localhost:3000", UrlInput.toNavigableUrl("localhost:3000"))
        assertEquals("https://exämple.de", UrlInput.toNavigableUrl("exämple.de"))
    }

    @Test
    fun schemasDangereuxRefuses() {
        for (input in listOf(
            "javascript:alert(1)", "file:///sdcard/x.html", "content://media/1", "data:text/html,x",
            "intent://x#Intent;end", "about:blank", "https://", "http:// espace.com"
        )) {
            assertNull(input, UrlInput.toNavigableUrl(input))
        }
    }

    @Test
    fun rechercheSinonAdresse() {
        assertEquals("https://duckduckgo.com/?q=chat+noir", UrlInput.resolve("chat noir", ddg))
        assertEquals("https://duckduckgo.com/?q=javascript%3Aalert%281%29", UrlInput.resolve("javascript:alert(1)", ddg))
        assertEquals("https://www.qwant.com/?q=zuri", UrlInput.resolve("zuri", SearchEngine.QWANT))
        assertEquals("", UrlInput.resolve("   ", ddg))
    }

    @Test
    fun hotes() {
        assertEquals("example.com", UrlInput.hostOf("https://user:pw@Example.com:8080/x"))
        assertEquals("::1", UrlInput.hostOf("http://[::1]:80/"))
        assertEquals("example.com", UrlInput.displayHost("https://www.example.com/"))
        assertNull(UrlInput.hostOf("about:blank"))
    }

    @Test
    fun passageEnHttps() {
        assertTrue(UrlInput.shouldUpgrade("http://example.com/x"))
        assertFalse(UrlInput.shouldUpgrade("https://example.com"))
        assertFalse(UrlInput.shouldUpgrade("http://localhost:8080"))
        assertFalse(UrlInput.shouldUpgrade("http://192.168.1.1/"))
        assertFalse(UrlInput.shouldUpgrade("http://172.20.0.5/"))
        assertFalse(UrlInput.shouldUpgrade("http://imprimante.local/"))
        assertFalse(UrlInput.shouldUpgrade("http://routeur/"))
        assertTrue(UrlInput.shouldUpgrade("http://172.32.0.5/"))
        assertEquals("https://example.com/x", UrlInput.toHttps("http://example.com/x"))
    }
}

class PopupLimiterTest {
    @Test
    fun rafalesBloquees() {
        val limiter = PopupLimiter()
        assertTrue(limiter.allow(0))
        assertTrue(limiter.allow(100))
        assertFalse(limiter.allow(200))
        assertTrue(limiter.allow(5_200))
        assertTrue(limiter.allow(10_400))
        assertTrue(limiter.allow(15_600))
        assertTrue(limiter.allow(20_800))
        // Six ouvertures dans la minute : la septième est refusée.
        assertFalse(limiter.allow(30_000))
        assertTrue(limiter.allow(60_100))
        assertEquals(2, limiter.blocked)
    }
}

class InternalActionsTest {
    @Test
    fun jetonUniqueLieALOnglet() {
        var now = 0L
        val actions = InternalActions { now }
        val token = actions.issue(1, "http://a.test/", InternalActions.Kind.INSECURE)
        assertNull("autre onglet", actions.take(token, 2))
        val again = actions.issue(1, "http://a.test/", InternalActions.Kind.INSECURE)
        assertNotNull(actions.take(again, 1))
        assertNull("usage unique", actions.take(again, 1))
        val late = actions.issue(1, "http://a.test/", InternalActions.Kind.RETRY)
        now += 11 * 60 * 1000
        assertNull("expiré", actions.take(late, 1))
        assertNull(actions.take("../../x", 1))
        assertNull(actions.take(null, 1))
    }
}

class PagesTest {
    @Test
    fun valeursEchappees() {
        val html = Pages.message(
            "fr", "<t>", "h\"", "<script>alert(1)</script>", "x' onerror='y",
            listOf(Pages.Action("a&b", "zuri://action?t=\"><script>")), Pages.Tone.DANGER
        )
        assertFalse(html.contains("<script>"))
        assertFalse(html.contains("' onerror='"))
        assertTrue(html.contains("&lt;script&gt;"))
        assertTrue(html.contains("a&amp;b"))
        assertTrue(html.contains("script-src") || html.contains("default-src 'none'"))
    }
}
