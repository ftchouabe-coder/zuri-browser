package af.zuri.browser

import android.content.Context
import android.util.Log
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

/**
 * Listes de filtrage téléchargées à l'exécution et vérifiées localement : aucune adresse
 * visitée ne quitte l'appareil. Mêmes sources que la version de bureau, avec miroir officiel.
 * Les téléchargements sont conditionnels (ETag / Last-Modified) pour économiser les données
 * mobiles, et ne passent que par HTTPS.
 */
class FilterLists(context: Context) {

    enum class Threat { PHISHING, MALWARE }

    private class ListSpec(val name: String, val maxAgeMs: Long, val mirrors: List<String>)

    @Volatile var ads: DomainSet = DomainSet.EMPTY
        private set
    @Volatile var phishing: DomainSet = DomainSet.EMPTY
        private set
    @Volatile var malware: DomainSet = DomainSet.EMPTY
        private set
    /** Instant de la dernière mise à jour des listes de sécurité (0 = jamais). */
    @Volatile var securityUpdatedAt = 0L
        private set

    private val appContext = context.applicationContext
    private val dir = File(appContext.filesDir, "filters").apply { mkdirs() }
    private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "zuri-filtres").apply { isDaemon = true; priority = Thread.MIN_PRIORITY }
    }
    private var retryScheduled = false

    fun start() {
        executor.execute {
            rebuild()
            refresh()
        }
    }

    fun threatFor(host: String, url: String): Threat? = when {
        phishing.matches(host, url) -> Threat.PHISHING
        malware.matches(host, url) -> Threat.MALWARE
        else -> null
    }

    private fun refresh() {
        var changed = false
        var incomplete = false
        for (spec in LISTS) {
            val file = File(dir, spec.name)
            if (file.exists() && System.currentTimeMillis() - file.lastModified() < spec.maxAgeMs) continue
            when (download(spec, file)) {
                Result.UPDATED -> changed = true
                Result.NOT_MODIFIED -> Unit
                Result.FAILED -> incomplete = true
            }
        }
        if (changed) rebuild()
        if (incomplete) scheduleRetry()
    }

    private fun scheduleRetry() {
        if (retryScheduled) return
        retryScheduled = true
        executor.schedule({
            retryScheduled = false
            refresh()
        }, RETRY_MS, TimeUnit.MILLISECONDS)
    }

    private fun rebuild() {
        val base = try {
            appContext.assets.open("base-filters.txt").bufferedReader().use { it.readText() }
        } catch (_: IOException) {
            ""
        }
        ads = DomainSet.Builder().addFilterList(base).also { builder ->
            read("easylist.txt")?.let(builder::addFilterList)
            read("easyprivacy.txt")?.let(builder::addFilterList)
        }.build()
        val phishingText = read("phishing.txt")
        val malwareText = read("malware.txt")
        phishing = phishingText?.let { DomainSet.Builder().addFilterList(it).build() } ?: DomainSet.EMPTY
        malware = malwareText?.let { DomainSet.Builder().addFilterList(it).build() } ?: DomainSet.EMPTY
        securityUpdatedAt = listOf("phishing.txt", "malware.txt")
            .map { File(dir, it) }.filter { it.exists() }.minOfOrNull { it.lastModified() } ?: 0L
        Log.i(TAG, "listes : pub ${ads.size}, phishing ${phishing.size}, malware ${malware.size}")
    }

    private fun read(name: String): String? = File(dir, name).takeIf { it.exists() }?.readText()

    private enum class Result { UPDATED, NOT_MODIFIED, FAILED }

    private fun download(spec: ListSpec, target: File): Result {
        val meta = File(dir, spec.name + ".etag")
        for (address in spec.mirrors) {
            var connection: HttpURLConnection? = null
            try {
                connection = URL(address).openConnection() as? HttpsURLConnection ?: continue
                connection.connectTimeout = 30_000
                // Délai *entre deux paquets* : une connexion lente mais active n'est pas abandonnée.
                connection.readTimeout = 60_000
                connection.instanceFollowRedirects = false
                connection.setRequestProperty("User-Agent", "Zuri-Android")
                if (target.exists() && meta.exists()) {
                    val (etag, modified) = meta.readLines().let { it.getOrNull(0).orEmpty() to it.getOrNull(1).orEmpty() }
                    if (etag.isNotEmpty()) connection.setRequestProperty("If-None-Match", etag)
                    if (modified.isNotEmpty()) connection.setRequestProperty("If-Modified-Since", modified)
                }
                when (connection.responseCode) {
                    HttpURLConnection.HTTP_NOT_MODIFIED -> {
                        target.setLastModified(System.currentTimeMillis())
                        return Result.NOT_MODIFIED
                    }
                    HttpURLConnection.HTTP_OK -> Unit
                    else -> continue
                }
                val tmp = File(dir, spec.name + ".tmp")
                connection.inputStream.use { input ->
                    tmp.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var total = 0L
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            total += read
                            if (total > MAX_BYTES) throw IOException("liste trop volumineuse")
                            output.write(buffer, 0, read)
                        }
                    }
                }
                if (tmp.length() < MIN_BYTES || !tmp.renameTo(target) && !(target.delete() && tmp.renameTo(target))) {
                    tmp.delete()
                    continue
                }
                meta.writeText(connection.getHeaderField("ETag").orEmpty() + "\n" + connection.getHeaderField("Last-Modified").orEmpty())
                return Result.UPDATED
            } catch (error: IOException) {
                Log.w(TAG, "$address indisponible : ${error.message}")
            } finally {
                connection?.disconnect()
            }
        }
        return Result.FAILED
    }

    private companion object {
        const val TAG = "ZuriFiltres"
        const val HOUR = 60 * 60 * 1000L
        const val RETRY_MS = 10 * 60 * 1000L
        const val MAX_BYTES = 64L * 1024 * 1024
        const val MIN_BYTES = 256L

        val LISTS = listOf(
            ListSpec("phishing.txt", 12 * HOUR, listOf(
                "https://malware-filter.gitlab.io/malware-filter/phishing-filter.txt",
                "https://malware-filter.pages.dev/phishing-filter.txt"
            )),
            ListSpec("malware.txt", 12 * HOUR, listOf(
                "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt",
                "https://malware-filter.pages.dev/urlhaus-filter-online.txt"
            )),
            ListSpec("easylist.txt", 96 * HOUR, listOf("https://easylist.to/easylist/easylist.txt")),
            ListSpec("easyprivacy.txt", 96 * HOUR, listOf("https://easylist.to/easylist/easyprivacy.txt"))
        )
    }
}
