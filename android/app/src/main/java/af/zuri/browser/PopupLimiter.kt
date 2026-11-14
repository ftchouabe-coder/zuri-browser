package af.zuri.browser

/** Au plus 2 fenêtres surgissantes par 5 s et 6 par minute pour un onglet (comme sur bureau). */
class PopupLimiter(private val burst: Int = 2, private val burstMs: Long = 5_000, private val perMinute: Int = 6) {
    private val times = ArrayDeque<Long>()
    var blocked = 0
        private set

    /** Enregistre une ouverture si elle est permise ; sinon la compte comme bloquée. */
    fun allow(now: Long): Boolean {
        while (times.isNotEmpty() && now - times.first() >= 60_000) times.removeFirst()
        val recent = times.count { now - it < burstMs }
        if (recent >= burst || times.size >= perMinute) {
            blocked++
            return false
        }
        times.addLast(now)
        return true
    }

    /** Ouverture refusée pour une autre raison (pas de geste de l'utilisateur). */
    fun recordBlocked() {
        blocked++
    }

    fun reset() {
        blocked = 0
    }
}
