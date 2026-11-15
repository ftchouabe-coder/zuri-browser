package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FileSafetyTest {
    @Test
    fun fichiersExecutables() {
        assertTrue(FileSafety.isDangerous("whatsapp-gold.APK"))
        assertTrue(FileSafety.isDangerous("facture.pdf.exe"))
        assertTrue(FileSafety.isDangerous("jeu.xapk"))
        assertFalse(FileSafety.isDangerous("photo.jpg"))
        assertFalse(FileSafety.isDangerous("rapport.pdf"))
        assertFalse(FileSafety.isDangerous("sans-extension"))
    }

    @Test
    fun nomsNettoyes() {
        assertEquals("passwd", FileSafety.sanitize("../../etc/passwd"))
        assertEquals("a.txt", FileSafety.sanitize("..\\a.txt"))
        assertEquals("bashrc", FileSafety.sanitize(".bashrc"))
        assertEquals("ab.pdf", FileSafety.sanitize("a\u0000b.pdf"))
        assertEquals("telechargement", FileSafety.sanitize("???"))
        val long = FileSafety.sanitize("x".repeat(300) + ".apk")
        assertEquals(120, long.length)
        assertTrue(long.endsWith(".apk"))
    }

    @Test
    fun tailles() {
        assertNull(FileSafety.formatSize(-1))
        assertEquals("512 o", FileSafety.formatSize(512))
        assertEquals("2 Ko", FileSafety.formatSize(2048))
        assertEquals("1,5 Mo", FileSafety.formatSize(1_572_864))
    }
}
