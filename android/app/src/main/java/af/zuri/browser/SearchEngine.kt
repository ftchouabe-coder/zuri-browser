package af.zuri.browser

/** Moteurs proposés : la même liste que la version de bureau. */
enum class SearchEngine(val id: String, val label: String, val searchUrl: String) {
    DUCKDUCKGO("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q=%s"),
    GOOGLE("google", "Google", "https://www.google.com/search?q=%s"),
    BING("bing", "Bing", "https://www.bing.com/search?q=%s"),
    BRAVE("brave", "Brave Search", "https://search.brave.com/search?q=%s"),
    QWANT("qwant", "Qwant", "https://www.qwant.com/?q=%s"),
    ECOSIA("ecosia", "Ecosia", "https://www.ecosia.org/search?q=%s"),
    STARTPAGE("startpage", "Startpage", "https://www.startpage.com/sp/search?query=%s"),
    MOJEEK("mojeek", "Mojeek", "https://www.mojeek.com/search?q=%s");

    companion object {
        fun byId(id: String?): SearchEngine = entries.firstOrNull { it.id == id } ?: DUCKDUCKGO
    }
}
