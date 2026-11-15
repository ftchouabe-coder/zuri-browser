package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OfflineShelfTest {
    private fun article(n: Int, size: Int = 10) = Article("https://a.test/$n", "A$n", "fr", listOf(Block('p', "x".repeat(size))), n.toLong())

    @Test
    fun enregistrementSansDoublon() {
        val shelf = OfflineShelf()
        var saves = 0
        shelf.onChange = { saves++ }
        shelf.save(article(1))
        shelf.save(article(2))
        shelf.save(article(1).copy(title = "A1 bis"))
        assertEquals(listOf("A1 bis", "A2"), shelf.list().map { it.title })
        shelf.save(Article("javascript:x", "x", "", listOf(Block('p', "x"))))
        shelf.save(Article("https://vide.test", "x", "", emptyList()))
        assertEquals(2, shelf.list().size)
        shelf.remove("https://a.test/2")
        assertNull(shelf.get("https://a.test/2"))
        assertEquals(4, saves)
    }

    @Test
    fun bornes() {
        val parNombre = OfflineShelf(maxArticles = 3)
        (1..5).forEach { parNombre.save(article(it)) }
        assertEquals(listOf("A5", "A4", "A3"), parNombre.list().map { it.title })
        val parTaille = OfflineShelf(maxChars = 250)
        (1..5).forEach { parTaille.save(article(it, size = 100)) }
        assertEquals("les plus anciens sont retirés", listOf("A5", "A4"), parTaille.list().map { it.title })
    }
}
