package af.zuri.browser

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackupTest {
    private val plain = "{\"bookmarks\":[\"https://jumia.com.ng/\"]}".toByteArray()
    private val password = "kribi-2026!".toCharArray()

    @Test
    fun allerRetour() {
        val sealed = BackupCrypto.seal(plain, password, BackupCrypto.TEST_ITERATIONS)
        assertArrayEquals(plain, BackupCrypto.open(sealed, password))
        assertFalse("rien en clair", String(sealed, Charsets.ISO_8859_1).contains("jumia"))
        val other = BackupCrypto.seal(plain, password, BackupCrypto.TEST_ITERATIONS)
        assertFalse("sel et IV aléatoires", sealed.contentEquals(other))
    }

    @Test(expected = BackupCrypto.WrongPassword::class)
    fun mauvaisMotDePasse() {
        BackupCrypto.open(BackupCrypto.seal(plain, password, BackupCrypto.TEST_ITERATIONS), "autre".toCharArray())
    }

    @Test
    fun fichierModifieOuEtranger() {
        val sealed = BackupCrypto.seal(plain, password, BackupCrypto.TEST_ITERATIONS)
        val flipped = sealed.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 1).toByte() }
        assertTrue(runCatching { BackupCrypto.open(flipped, password) }.exceptionOrNull() is BackupCrypto.WrongPassword)
        val salt = sealed.copyOf().also { it[10] = (it[10].toInt() xor 1).toByte() }
        assertTrue("en-tête authentifié", runCatching { BackupCrypto.open(salt, password) }.exceptionOrNull() is BackupCrypto.WrongPassword)
        val weak = sealed.copyOf().also { it[4] = 0; it[5] = 0; it[6] = 0; it[7] = 1 }
        assertTrue("itérations trop faibles refusées", runCatching { BackupCrypto.open(weak, password) }.exceptionOrNull() is BackupCrypto.InvalidFile)
        assertTrue(runCatching { BackupCrypto.open("PK\u0003\u0004zip".toByteArray(), password) }.exceptionOrNull() is BackupCrypto.InvalidFile)
    }

    @Test
    fun fusionDeLaBibliotheque() {
        val lib = Library()
        lib.recordVisit("https://a.test/", "A", 10)
        lib.toggleBookmark("https://b.test/", "B", 1)
        lib.merge(
            listOf(Visit("https://a.test/", "A ancien", 5), Visit("https://c.test/", "C", 20), Visit("data:x", "", 30)),
            listOf(Bookmark("https://b.test/", "B", 1), Bookmark("https://d.test/", "D", 2))
        )
        assertEquals(listOf("https://c.test/", "https://a.test/"), lib.history().map { it.url })
        assertEquals("plus récent conservé", "A", lib.history()[1].title)
        assertEquals(setOf("https://b.test/", "https://d.test/"), lib.bookmarks().map { it.url }.toSet())
    }
}
