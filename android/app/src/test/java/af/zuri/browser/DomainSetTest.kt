package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainSetTest {
    private val list = DomainSet.Builder().addFilterList(
        """
        ! commentaire
        [Adblock Plus 2.0]
        ||doubleclick.net^
        ||tracker.example^${'$'}third-party
        ||cdn.example^${'$'}script,third-party
        @@||safe.doubleclick.net^
        @@||elem.example^${'$'}elemhide
        ||evil.example/malware.exe^
        ||files.example/payload/
        ||bad-*.example^
        example.org##.ad-banner
        ||Upper.Example^|
        """.trimIndent()
    ).build()

    private fun hit(url: String) = list.matches(UrlInput.hostOf(url)!!, url)

    @Test
    fun reglesDHote() {
        assertTrue(hit("https://doubleclick.net/x"))
        assertTrue(hit("https://ad.g.doubleclick.net/pagead"))
        assertTrue(hit("https://tracker.example/p.gif"))
        assertTrue(hit("https://upper.example/"))
        assertFalse("suffixe sans point", hit("https://notdoubleclick.net/"))
        assertFalse("options par type ignorées", hit("https://cdn.example/lib.js"))
        assertFalse("jokers ignorés", hit("https://bad-1.example/"))
    }

    @Test
    fun exceptions() {
        assertFalse(hit("https://safe.doubleclick.net/ok.js"))
        assertFalse(hit("https://x.safe.doubleclick.net/ok.js"))
    }

    @Test
    fun cheminsSignales() {
        assertTrue(hit("http://evil.example/malware.exe"))
        assertTrue(hit("https://files.example/payload/a.apk"))
        assertFalse(hit("https://evil.example/"))
        assertFalse(hit("https://files.example/autre"))
    }

    @Test
    fun siteApproche() {
        assertEquals("example.com", DomainSet.siteOf("a.b.example.com"))
        assertEquals("example.co.uk", DomainSet.siteOf("www.example.co.uk"))
        assertEquals("jumia.com.ng", DomainSet.siteOf("www.jumia.com.ng"))
        assertEquals("example.com", DomainSet.siteOf("example.com"))
        assertEquals("10.0.0.1", DomainSet.siteOf("10.0.0.1"))
    }
}
