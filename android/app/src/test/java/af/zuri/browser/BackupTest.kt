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

    /** Produit le vecteur relu par le bureau (tests/unit/backup.test.ts). */
    @Test
    fun vecteurPourLeBureau() {
        val sealed = BackupCrypto.seal(VECTOR_PLAIN.toByteArray(), password, BackupCrypto.TEST_ITERATIONS)
        println("VECTEUR_ANDROID=" + java.util.Base64.getEncoder().encodeToString(sealed))
        assertArrayEquals(VECTOR_PLAIN.toByteArray(), BackupCrypto.open(sealed, password))
    }

    /** Fichier produit par la version de bureau (Node, `sealBackup`) : doit se relire ici. */
    @Test
    fun relitUneSauvegardeDuBureau() {
        val fromDesktop = java.util.Base64.getDecoder().decode(DESKTOP_VECTOR)
        assertEquals(VECTOR_PLAIN, String(BackupCrypto.open(fromDesktop, password)))
    }

    private companion object {
        const val VECTOR_PLAIN = "{\"format\":\"zuri-sauvegarde\",\"v\":1,\"bookmarks\":[{\"u\":\"https://jumia.com.ng/\",\"t\":\"Jumia\",\"d\":5}]}"
        const val DESKTOP_VECTOR = "WkJLMQAAA+ixf88QkoUcSXGoGzP64IffSLJzsYtVENb8zS3rTQln6uG6nyR3BPI1W6LKf26rZTooNkCj/P+gI5QKdHH4v64scCJKn0lsdTPheljFkCz1ELIksJJ319Riflw7lH5CIY1+YZxWm8VXvhNVF9lKnWWl+l+tFmRmL9Lw00CgrhFfyHJ+gFD2sHhyEBy7lg=="
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
