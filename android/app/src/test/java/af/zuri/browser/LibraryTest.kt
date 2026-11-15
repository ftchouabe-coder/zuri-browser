package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LibraryTest {
    @Test
    fun historiqueSansDoublonEtBorne() {
        val lib = Library(maxHistory = 3)
        lib.recordVisit("https://a.test/", "A", 1)
        lib.recordVisit("https://b.test/", "B", 2)
        lib.recordVisit("https://a.test/", "", 3)
        assertEquals(listOf("https://a.test/", "https://b.test/"), lib.history().map { it.url })
        assertEquals("titre conservé", "A", lib.history()[0].title)
        lib.recordVisit("https://c.test/", "C", 4)
        lib.recordVisit("https://d.test/", "D", 5)
        assertEquals(3, lib.history().size)
        lib.recordVisit("about:blank", "x", 6)
        lib.recordVisit("javascript:alert(1)", "x", 7)
        assertEquals(3, lib.history().size)
    }

    @Test
    fun favoris() {
        val lib = Library()
        var saves = 0
        lib.onChange = { saves++ }
        assertTrue(lib.toggleBookmark("https://jumia.com.ng/", "", 1))
        assertTrue(lib.isBookmarked("https://jumia.com.ng/"))
        assertEquals("jumia.com.ng", lib.bookmarks()[0].title)
        assertFalse(lib.toggleBookmark("https://jumia.com.ng/", "", 2))
        assertFalse(lib.toggleBookmark("file:///sdcard/x", "", 3))
        assertEquals(2, saves)
    }

    @Test
    fun suggestionsLocales() {
        val lib = Library()
        lib.recordVisit("https://www.jeuneafrique.com/", "Jeune Afrique", 1)
        lib.recordVisit("https://fr.wikipedia.org/wiki/Douala", "Douala — Wikipédia", 2)
        lib.toggleBookmark("https://www.journalducameroun.com/", "Journal du Cameroun", 3)
        val j = lib.suggest("j")
        assertEquals("https://www.journalducameroun.com/", j[0].url)
        assertTrue(j[0].bookmarked)
        assertEquals(2, j.size)
        assertEquals("https://fr.wikipedia.org/wiki/Douala", lib.suggest("douala")[0].url)
        assertTrue(lib.suggest("   ").isEmpty())
        assertTrue(lib.suggest("introuvable").isEmpty())
    }

    @Test
    fun restaurationFiltree() {
        val lib = Library()
        lib.restore(
            listOf(Visit("https://a.test/", "A", 1), Visit("https://a.test/", "A2", 0), Visit("data:x", "", 0)),
            listOf(Bookmark("javascript:x", "", 0), Bookmark("https://b.test/", "B", 0))
        )
        assertEquals(1, lib.history().size)
        assertEquals(listOf("https://b.test/"), lib.bookmarks().map { it.url })
    }
}
