package af.zuri.browser

import java.util.Locale

data class Visit(val url: String, val title: String, val time: Long)

data class Bookmark(val url: String, val title: String, val time: Long)

data class Suggestion(val url: String, val title: String, val bookmarked: Boolean)

/**
 * Favoris et historique en mémoire (le plus récent en premier), partagés entre l'interface et le
 * fil de filtrage des suggestions : toutes les méthodes sont synchronisées et renvoient des copies.
 * Les onglets privés n'y écrivent jamais (la vérification est faite par l'appelant).
 */
class Library(private val maxHistory: Int = 2000) {
    private val visits = ArrayList<Visit>()
    private val marks = ArrayList<Bookmark>()

    /** Appelé après chaque modification (sauvegarde différée). */
    var onChange: (() -> Unit)? = null

    @Synchronized
    fun recordVisit(url: String, title: String, now: Long) {
        if (!UrlInput.isHttp(url)) return
        val index = visits.indexOfFirst { it.url == url }
        val previousTitle = if (index >= 0) visits.removeAt(index).title else ""
        visits.add(0, Visit(url, title.ifBlank { previousTitle }, now))
        while (visits.size > maxHistory) visits.removeAt(visits.size - 1)
        changed()
    }

    @Synchronized
    fun updateTitle(url: String, title: String) {
        if (title.isBlank()) return
        val index = visits.indexOfFirst { it.url == url }
        if (index >= 0 && visits[index].title != title) {
            visits[index] = visits[index].copy(title = title)
            changed()
        }
    }

    @Synchronized
    fun isBookmarked(url: String): Boolean = marks.any { it.url == url }

    /** Ajoute ou retire le favori ; renvoie `true` s'il est désormais présent. */
    @Synchronized
    fun toggleBookmark(url: String, title: String, now: Long): Boolean {
        if (!UrlInput.isHttp(url)) return false
        val removed = marks.removeAll { it.url == url }
        if (!removed) marks.add(0, Bookmark(url, title.ifBlank { UrlInput.displayHost(url) }, now))
        changed()
        return !removed
    }

    @Synchronized
    fun removeBookmark(url: String) {
        if (marks.removeAll { it.url == url }) changed()
    }

    @Synchronized
    fun removeVisit(url: String) {
        if (visits.removeAll { it.url == url }) changed()
    }

    @Synchronized
    fun clearHistory() {
        if (visits.isEmpty()) return
        visits.clear()
        changed()
    }

    @Synchronized
    fun history(): List<Visit> = ArrayList(visits)

    @Synchronized
    fun bookmarks(): List<Bookmark> = ArrayList(marks)

    /** Remplace le contenu (chargement depuis le disque) sans déclencher de sauvegarde. */
    @Synchronized
    fun restore(history: List<Visit>, bookmarks: List<Bookmark>) {
        visits.clear()
        visits.addAll(history.filter { UrlInput.isHttp(it.url) }.distinctBy { it.url }.take(maxHistory))
        marks.clear()
        marks.addAll(bookmarks.filter { UrlInput.isHttp(it.url) }.distinctBy { it.url })
    }

    /**
     * Suggestions pour la barre d'adresse, calculées localement : rien n'est envoyé au moteur de
     * recherche pendant la saisie. Les favoris passent devant à pertinence égale.
     */
    @Synchronized
    fun suggest(query: String, limit: Int = 6): List<Suggestion> {
        val q = query.trim().lowercase(Locale.ROOT)
        if (q.isEmpty()) return emptyList()
        val seen = HashSet<String>()
        val scored = ArrayList<Triple<Suggestion, Int, Int>>()
        var order = 0
        for (mark in marks) {
            val score = score(q, mark.url, mark.title)
            if (score > 0 && seen.add(mark.url)) scored += Triple(Suggestion(mark.url, mark.title, true), score + 1, order++)
        }
        for (visit in visits) {
            val score = score(q, visit.url, visit.title)
            if (score > 0 && seen.add(visit.url)) scored += Triple(Suggestion(visit.url, visit.title, false), score, order++)
        }
        return scored.sortedWith(compareByDescending<Triple<Suggestion, Int, Int>> { it.second }.thenBy { it.third })
            .take(limit).map { it.first }
    }

    private fun score(q: String, url: String, title: String): Int {
        val bare = url.lowercase(Locale.ROOT).substringAfter("://").removePrefix("www.")
        return when {
            bare.startsWith(q) -> 3
            UrlInput.displayHost(url).contains(q) || title.lowercase(Locale.ROOT).contains(q) -> 2
            bare.contains(q) -> 1
            else -> 0
        }
    }

    private fun changed() {
        onChange?.invoke()
    }
}
