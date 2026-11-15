package af.zuri.browser

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.net.URL
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

object Versions {
    /** `v0.3.0` est-elle plus récente que `0.2.0` ? Les suffixes (`-beta`) sont ignorés. */
    fun isNewer(candidate: String, current: String): Boolean {
        val a = parts(candidate)
        val b = parts(current)
        if (a.isEmpty() || b.isEmpty()) return false
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun parts(version: String): List<Int> =
        version.trim().removePrefix("v").removePrefix("V").substringBefore('-').substringBefore('+')
            .split('.').map { it.toIntOrNull() ?: return emptyList() }
}

/**
 * Vérification hebdomadaire d'une nouvelle version publiée sur GitHub (Wi-Fi seulement). Seule
 * une requête anonyme vers l'API publique des « releases » est faite ; l'installation reste une
 * décision de l'utilisateur, et Android refuse toute mise à jour qui n'est pas signée par la
 * même clé que la version installée.
 */
class UpdateChecker(context: Context) {
    data class Update(val version: String, val page: String)

    private val prefs = context.applicationContext.getSharedPreferences("mises-a-jour", Context.MODE_PRIVATE)
    private val executor = Executors.newSingleThreadExecutor { Thread(it, "zuri-mises-a-jour").apply { isDaemon = true } }
    private val main = Handler(Looper.getMainLooper())

    fun checkIfDue(enabled: Boolean, metered: Boolean, onFound: (Update) -> Unit) {
        if (!enabled || metered) return
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("lastCheck", 0) < WEEK_MS) return
        executor.execute {
            val update = fetch() ?: return@execute
            prefs.edit().putLong("lastCheck", now).apply()
            if (Versions.isNewer(update.version, BuildConfig.VERSION_NAME) && update.version != prefs.getString("dismissed", null)) {
                main.post { onFound(update) }
            }
        }
    }

    fun dismiss(version: String) {
        prefs.edit().putString("dismissed", version).apply()
    }

    private fun fetch(): Update? {
        var connection: HttpsURLConnection? = null
        return try {
            connection = URL(API).openConnection() as HttpsURLConnection
            connection.connectTimeout = 20_000
            connection.readTimeout = 30_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            connection.setRequestProperty("User-Agent", "Zuri-Android")
            if (connection.responseCode != 200) return null
            val text = connection.inputStream.bufferedReader().use { it.readText().take(512 * 1024) }
            val json = JSONObject(text)
            val page = json.optString("html_url")
            val assets = json.optJSONArray("assets")
            val hasApk = assets != null && (0 until assets.length()).any { assets.optJSONObject(it)?.optString("name")?.endsWith("-android.apk") == true }
            if (!hasApk || !page.startsWith(RELEASES_PAGE)) null else Update(json.optString("tag_name"), page)
        } catch (error: IOException) {
            Log.w("ZuriMaj", "vérification impossible : ${error.message}")
            null
        } catch (error: org.json.JSONException) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    private companion object {
        const val API = "https://api.github.com/repos/ftchouabe-coder/zuri-browser/releases/latest"
        const val RELEASES_PAGE = "https://github.com/ftchouabe-coder/zuri-browser/releases/"
        const val WEEK_MS = 7 * 24 * 60 * 60 * 1000L
    }
}
