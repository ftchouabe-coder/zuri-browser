package af.zuri.browser

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Persistance chiffrée de la [Library], avec sauvegarde différée hors du fil principal. */
object LibraryStore {
    @Volatile private var instance: Library? = null
    private val executor = Executors.newSingleThreadScheduledExecutor { Thread(it, "zuri-bibliotheque").apply { isDaemon = true } }
    private var pending: ScheduledFuture<*>? = null

    fun shared(context: Context): Library = instance ?: synchronized(this) {
        instance ?: create(context.applicationContext).also { instance = it }
    }

    private fun create(context: Context): Library {
        val store = SecureStore(context, "bibliotheque.bin")
        val library = Library()
        store.read()?.let { text ->
            try {
                val json = JSONObject(text)
                library.restore(
                    json.optJSONArray("history").objects().map { Visit(it.getString("u"), it.optString("t"), it.optLong("d")) },
                    json.optJSONArray("bookmarks").objects().map { Bookmark(it.getString("u"), it.optString("t"), it.optLong("d")) }
                )
            } catch (error: Exception) {
                Log.w("ZuriStockage", "bibliothèque ignorée : ${error.message}")
            }
        }
        library.onChange = { schedule(store, library) }
        return library
    }

    private fun schedule(store: SecureStore, library: Library) = synchronized(this) {
        pending?.cancel(false)
        pending = executor.schedule({ save(store, library) }, 1500, TimeUnit.MILLISECONDS)
    }

    private fun save(store: SecureStore, library: Library) {
        val json = JSONObject()
            .put("v", 1)
            .put("history", JSONArray().apply { library.history().forEach { put(JSONObject().put("u", it.url).put("t", it.title).put("d", it.time)) } })
            .put("bookmarks", JSONArray().apply { library.bookmarks().forEach { put(JSONObject().put("u", it.url).put("t", it.title).put("d", it.time)) } })
        try {
            store.write(json.toString())
        } catch (error: Exception) {
            Log.w("ZuriStockage", "sauvegarde impossible : ${error.message}")
        }
    }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }
}
