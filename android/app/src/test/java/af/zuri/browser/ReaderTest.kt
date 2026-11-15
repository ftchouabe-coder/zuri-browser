package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderTest {
    private val labels = Reader.Labels("fr", "Voir l’article original", { "$it min de lecture" })

    private val article = Article(
        "https://www.exemple.cm/article",
        "Titre <b>gras</b>",
        "fr",
        listOf(
            Block('h', "Titre <b>gras</b>"),
            Block('p', "Paragraphe <script>alert(1)</script> & suite."),
            Block('l', "Un"), Block('l', "Deux"),
            Block('q', "Citation"),
            Block('p', ("mot ".repeat(450)).trim())
        )
    )

    @Test
    fun pageSansInjection() {
        val html = Reader.html(article, labels)
        assertFalse(html.contains("<script>"))
        assertFalse(html.contains("<b>"))
        assertTrue(html.contains("&lt;script&gt;alert(1)&lt;/script&gt; &amp; suite."))
        assertTrue(html.contains("<ul><li>Un</li><li>Deux</li></ul><blockquote>"))
        assertTrue(html.contains("default-src 'none'"))
        assertTrue(html.contains("href=\"https://www.exemple.cm/article\""))
        assertEquals("titre non répété", 1, Regex("Titre &lt;b&gt;gras&lt;/b&gt;</h").findAll(html).count())
        assertTrue(html.contains("3 min de lecture"))
    }

    @Test
    fun langueEtLienControles() {
        val bad = article.copy(url = "javascript:alert(1)", lang = "fr\"><script>")
        val html = Reader.html(bad, labels)
        assertFalse(html.contains("javascript:"))
        assertTrue(html.contains("<html lang=\"fr\">"))
    }

    @Test
    fun nettoyageDesNotes() {
        val cleaned = Reader.clean(
            listOf(
                Block('p', "Peuplée de 2 765 000 d'habitants en 2015[3], elle est [réf. nécessaire] grande."),
                Block('p', "[1])"),
                Block('p', "—"),
                Block('l', "Voir [a] la carte")
            )
        )
        assertEquals(
            listOf("Peuplée de 2 765 000 d'habitants en 2015, elle est grande.", "Voir la carte"),
            cleaned.map { it.text }
        )
    }

    @Test
    fun decoupagePourLaVoix() {
        val chunks = Reader.speechChunks(article, max = 500)
        assertTrue(chunks.all { it.length <= 500 })
        assertTrue(chunks.first().startsWith("Titre <b>gras</b>\nParagraphe"))
        assertEquals("aucun mot perdu", 450, chunks.joinToString(" ").split(Regex("\\s+")).count { it == "mot" })
    }
}
