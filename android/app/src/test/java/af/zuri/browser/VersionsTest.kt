package af.zuri.browser

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionsTest {
    @Test
    fun comparaison() {
        assertTrue(Versions.isNewer("v0.3.0", "0.2.0"))
        assertTrue(Versions.isNewer("0.2.1", "0.2.0"))
        assertTrue(Versions.isNewer("1.0", "0.9.9"))
        assertTrue(Versions.isNewer("0.10.0", "0.9.0"))
        assertFalse(Versions.isNewer("0.2.0", "0.2.0"))
        assertFalse(Versions.isNewer("v0.2.0-beta", "0.2.0"))
        assertFalse(Versions.isNewer("0.1.9", "0.2.0"))
        assertFalse(Versions.isNewer("nightly", "0.2.0"))
        assertFalse(Versions.isNewer("", "0.2.0"))
    }
}
