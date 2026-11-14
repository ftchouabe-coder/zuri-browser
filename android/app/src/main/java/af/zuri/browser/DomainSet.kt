package af.zuri.browser

import java.util.Locale

/**
 * Sous-ensemble des listes au format Adblock Plus, adapté à `shouldInterceptRequest` :
 * règles d'hôte (`||exemple.com^`), règles d'hôte + début de chemin (`||exemple.com/x.exe`)
 * et exceptions d'hôte (`@@||exemple.com^`). Les règles cosmétiques et celles qui dépendent
 * du type de ressource sont ignorées : mieux vaut laisser passer que casser un site.
 * L'objet est immuable une fois construit ; il est partagé entre fils sans verrou.
 */
class DomainSet private constructor(
    private val hosts: Set<String>,
    private val paths: Map<String, List<String>>,
    private val exceptions: Set<String>
) {
    val size: Int get() = hosts.size + paths.size

    /** La requête vers `url` (d'hôte `host`, en minuscules) est-elle visée ? */
    fun matches(host: String, url: String): Boolean {
        var suffix = host
        var hit = false
        while (true) {
            if (suffix in exceptions) return false
            if (!hit && (suffix in hosts || pathMatches(suffix, host, url))) hit = true
            val dot = suffix.indexOf('.')
            if (dot < 0) break
            suffix = suffix.substring(dot + 1)
        }
        return hit
    }

    private fun pathMatches(ruleHost: String, host: String, url: String): Boolean {
        val prefixes = paths[ruleHost] ?: return false
        val path = pathOf(url, host) ?: return false
        return prefixes.any { path.startsWith(it) }
    }

    class Builder {
        private val hosts = HashSet<String>()
        private val paths = HashMap<String, MutableList<String>>()
        private val exceptions = HashSet<String>()

        fun addFilterList(text: String): Builder {
            text.lineSequence().forEach(::addRule)
            return this
        }

        private fun addRule(raw: String) {
            val line = raw.trim()
            if (line.isEmpty() || line[0] == '!' || line[0] == '[' || line.contains('#')) return
            val exception = line.startsWith("@@")
            val body = if (exception) line.substring(2) else line
            if (!body.startsWith("||")) return
            val dollar = body.indexOf('$')
            val pattern = if (dollar >= 0) body.substring(2, dollar) else body.substring(2)
            if (dollar >= 0) {
                val options = body.substring(dollar + 1).split(',').map { it.trim().lowercase(Locale.ROOT) }
                if (!options.all { it in ACCEPTED_OPTIONS }) return
            }
            val clean = pattern.trimEnd('|')
            val hostEnd = clean.indexOfFirst { it == '/' || it == '^' || it == ':' }
            val host = (if (hostEnd < 0) clean else clean.substring(0, hostEnd)).lowercase(Locale.ROOT)
            if (!HOST.matches(host)) return
            val rest = if (hostEnd < 0) "" else clean.substring(hostEnd)
            when {
                rest.isEmpty() || rest == "^" -> if (exception) exceptions.add(host) else hosts.add(host)
                !exception && rest.startsWith("/") && rest.none { it == '*' } ->
                    paths.getOrPut(host) { ArrayList(1) }.add(rest.trimEnd('^'))
            }
        }

        fun build() = DomainSet(hosts, paths, exceptions)
    }

    companion object {
        val EMPTY = Builder().build()

        private val HOST = Regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")
        private val ACCEPTED_OPTIONS = setOf("third-party", "3p", "all", "document", "doc", "important", "popup")
        private val SECOND_LEVEL = setOf("co", "com", "org", "net", "gov", "ac", "edu", "or", "ne", "go", "gob", "nic")

        /** Chemin + requête de `url`, en ignorant le port. */
        fun pathOf(url: String, host: String): String? {
            val start = url.indexOf("://")
            if (start < 0) return null
            val slash = url.indexOf('/', start + 3)
            if (slash < 0) return "/"
            return if (url.substring(start + 3, slash).lowercase(Locale.ROOT).contains(host)) url.substring(slash) else null
        }

        /**
         * Domaine « enregistrable » approché (sans liste des suffixes publics complète) :
         * `a.b.exemple.com` -> `exemple.com`, `www.exemple.co.uk` -> `exemple.co.uk`.
         */
        fun siteOf(host: String): String {
            val labels = host.trimEnd('.').split('.')
            if (labels.size <= 2 || host.all { it.isDigit() || it == '.' }) return host
            val tld = labels[labels.size - 1]
            val sld = labels[labels.size - 2]
            val keep = if (tld.length == 2 && sld in SECOND_LEVEL) 3 else 2
            return labels.takeLast(keep).joinToString(".")
        }
    }
}
