package af.zuri.browser

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Articles enregistrés pour une lecture sans réseau : texte seul (quelques Ko par article),
 * le plus récent en premier, sans doublon. Bornés en nombre et en taille totale.
 */
class OfflineShelf(private val maxArticles: Int = 100, private val maxChars: Int = 3_000_000) {
    private val items = ArrayList<Article>()
    var onChange: (() -> Unit)? = null

    @Synchronized
    fun save(article: Article) {
        if (!UrlInput.isHttp(article.url) || article.blocks.isEmpty()) return
        items.removeAll { it.url == article.url }
        items.add(0, article)
        while (items.size > maxArticles || items.size > 1 && totalChars() > maxChars) items.removeAt(items.size - 1)
        onChange?.invoke()
    }

    @Synchronized
    fun remove(url: String) {
        if (items.removeAll { it.url == url }) onChange?.invoke()
    }

    @Synchronized
    fun get(url: String): Article? = items.firstOrNull { it.url == url }

    @Synchronized
    fun list(): List<Article> = ArrayList(items)

    @Synchronized
    fun restore(articles: List<Article>) {
        items.clear()
        items.addAll(articles.filter { UrlInput.isHttp(it.url) && it.blocks.isNotEmpty() }.distinctBy { it.url }.take(maxArticles))
    }

    private fun totalChars() = items.sumOf { a -> a.title.length + a.blocks.sumOf { it.text.length } }
}

/** Persistance chiffrée de l'[OfflineShelf] (même clé Keystore que la bibliothèque). */
object OfflineStore {
    @Volatile private var instance: OfflineShelf? = null
    private val executor = Executors.newSingleThreadExecutor { Thread(it, "zuri-hors-ligne").apply { isDaemon = true } }

    fun shared(context: Context): OfflineShelf = instance ?: synchronized(this) {
        instance ?: create(context.applicationContext).also { instance = it }
    }

    private fun create(context: Context): OfflineShelf {
        val store = SecureStore(context, "hors-ligne.bin")
        val shelf = OfflineShelf()
        store.read()?.let { text ->
            try {
                val array = JSONObject(text).optJSONArray("articles") ?: JSONArray()
                shelf.restore((0 until array.length()).mapNotNull { i -> array.optJSONObject(i)?.let(::decode) })
            } catch (error: Exception) {
                Log.w("ZuriStockage", "lecture hors ligne ignorée : ${error.message}")
            }
        }
        shelf.onChange = { executor.execute { save(store, shelf) } }
        return shelf
    }

    private fun save(store: SecureStore, shelf: OfflineShelf) {
        val array = JSONArray()
        for (a in shelf.list()) array.put(encode(a))
        try {
            store.write(JSONObject().put("v", 1).put("articles", array).toString())
        } catch (error: Exception) {
            Log.w("ZuriStockage", "sauvegarde hors ligne impossible : ${error.message}")
        }
    }

    fun encode(a: Article): JSONObject {
        val blocks = JSONArray()
        a.blocks.forEach { blocks.put(JSONArray().put(it.kind.toString()).put(it.text)) }
        return JSONObject().put("u", a.url).put("t", a.title).put("l", a.lang).put("d", a.savedAt).put("b", blocks)
    }

    fun decode(o: JSONObject): Article? {
        val raw = o.optJSONArray("b") ?: return null
        val blocks = (0 until raw.length()).mapNotNull { i ->
            val b = raw.optJSONArray(i) ?: return@mapNotNull null
            val kind = b.optString(0, "p").firstOrNull()?.takeIf { it in "hplq" } ?: 'p'
            b.optString(1).takeIf { it.isNotBlank() }?.let { Block(kind, it) }
        }
        return Article(o.optString("u"), o.optString("t"), o.optString("l"), Reader.clean(blocks), o.optLong("d"))
    }
}
