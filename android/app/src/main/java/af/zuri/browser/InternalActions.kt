package af.zuri.browser

import java.security.SecureRandom

/** Jetons à usage unique pour les boutons des pages internes (expirent après 10 minutes). */
class InternalActions(private val clock: () -> Long = System::currentTimeMillis) {
    enum class Kind { RETRY, BACK, INSECURE, PROCEED_UNSAFE }

    data class Action(val tabId: Int, val url: String, val kind: Kind, val expires: Long)

    private val random = SecureRandom()
    private val pending = HashMap<String, Action>()

    fun issue(tabId: Int, url: String, kind: Kind): String {
        purge()
        val bytes = ByteArray(16).also(random::nextBytes)
        val token = bytes.joinToString("") { "%02x".format(it) }
        pending[token] = Action(tabId, url, kind, clock() + TTL_MS)
        return token
    }

    fun href(tabId: Int, url: String, kind: Kind): String = "zuri://action?t=" + issue(tabId, url, kind)

    /** Consomme le jeton s'il est valide pour cet onglet. */
    fun take(token: String?, tabId: Int): Action? {
        if (token == null || !TOKEN.matches(token)) return null
        val action = pending.remove(token) ?: return null
        if (action.tabId != tabId || action.expires < clock()) return null
        return action
    }

    fun forgetTab(tabId: Int) {
        pending.entries.removeAll { it.value.tabId == tabId }
    }

    private fun purge() {
        val now = clock()
        pending.entries.removeAll { it.value.expires < now }
    }

    private companion object {
        const val TTL_MS = 10 * 60 * 1000L
        val TOKEN = Regex("^[0-9a-f]{32}$")
    }
}
