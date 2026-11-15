package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PageScriptsTest {
    @Test
    fun selecteursFiltres() {
        assertTrue(PageScripts.isPlainSelector(".ad-banner"))
        assertTrue(PageScripts.isPlainSelector("div[id^=\"google_ads_\"]"))
        assertFalse(PageScripts.isPlainSelector(".x:-abp-has(.ad)"))
        assertFalse(PageScripts.isPlainSelector(".x:has-text(Pub)"))
        assertFalse("injection CSS", PageScripts.isPlainSelector(".a{} body{display:none}"))
        assertFalse(PageScripts.isPlainSelector("</style><script>"))
    }

    @Test
    fun scriptCosmetique() {
        val js = PageScripts.cosmetic(listOf(".pub", ".pub", ".x:-abp-has(a)", "#ad"))
        assertTrue(js.contains(":where(.pub,#ad){display:none!important}"))
        assertTrue(js.contains("window.top!==window"))
        assertEquals("", PageScripts.cosmetic(listOf(".x:style(a)")))
        val many = PageScripts.cosmetic((1..10_000).map { ".s$it" })
        assertFalse("plafonné", many.contains(".s4001,") || many.contains(".s4001)"))
    }

    @Test
    fun chainesEchappees() {
        assertEquals("\"a\\\"b\\\\c\\u003c/script\\u003e\\u000a\"", PageScripts.jsString("a\"b\\c</script>\n"))
        assertTrue(PageScripts.COOKIE_REFUSAL.contains("#onetrust-reject-all-handler"))
        assertFalse("jamais « accepter »", PageScripts.REFUSE_BUTTONS.any { it.contains("accept", ignoreCase = true) })
    }
}
