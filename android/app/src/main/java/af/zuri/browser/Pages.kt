package af.zuri.browser

/**
 * Pages internes (accueil, erreurs, avertissements) chargées comme données, sans script :
 * la CSP interdit tout JavaScript et toute ressource externe, et chaque valeur est échappée.
 * Les actions sont des liens `zuri://action?t=<jeton>` interceptés par l'application ; le jeton,
 * à usage unique et lié à l'onglet, empêche une page web de déclencher ces actions.
 */
object Pages {
    data class Action(val label: String, val href: String, val primary: Boolean = false)

    enum class Tone { NEUTRAL, WARNING, DANGER }

    const val CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'"

    fun escape(value: String): String = buildString(value.length) {
        for (c in value) when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&#39;")
            else -> append(c)
        }
    }

    fun message(
        lang: String,
        title: String,
        heading: String,
        body: String,
        detail: String?,
        actions: List<Action>,
        tone: Tone
    ): String {
        val accent = when (tone) {
            Tone.NEUTRAL -> "#24325b"
            Tone.WARNING -> "#9a6a1f"
            Tone.DANGER -> "#a8451f"
        }
        val buttons = actions.joinToString("") {
            val cls = if (it.primary) "btn primary" else "btn"
            "<a class=\"$cls\" href=\"${escape(it.href)}\">${escape(it.label)}</a>"
        }
        val detailHtml = detail?.let { "<p class=\"detail\">${escape(it)}</p>" } ?: ""
        return shell(
            lang, title, accent,
            "<main><div class=\"mark\" aria-hidden=\"true\"></div>" +
                "<h1>${escape(heading)}</h1><p>${escape(body)}</p>$detailHtml<nav>$buttons</nav></main>"
        )
    }

    fun start(lang: String, title: String, tagline: String, note: String?): String {
        val noteHtml = note?.let { "<p class=\"note\">${escape(it)}</p>" } ?: ""
        return shell(
            lang, title, "#24325b",
            "<main class=\"start\"><div class=\"sun\" aria-hidden=\"true\"></div>" +
                "<h1>Zuri</h1><p>${escape(tagline)}</p>$noteHtml</main>"
        )
    }

    private fun shell(lang: String, title: String, accent: String, body: String): String =
        "<!doctype html><html lang=\"${escape(lang)}\"><head><meta charset=\"utf-8\">" +
            "<meta http-equiv=\"Content-Security-Policy\" content=\"$CSP\">" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<meta name=\"referrer\" content=\"no-referrer\">" +
            "<title>${escape(title)}</title><style>${STYLE.replace("ACCENT", accent)}</style></head>" +
            "<body>$body</body></html>"

    private val STYLE = """
        :root{--bg:#faf7f0;--ink:#1b1917;--soft:#6d6355;--line:#dcd0bb;--accent:ACCENT;color-scheme:light dark}
        @media (prefers-color-scheme:dark){:root{--bg:#1f1b17;--ink:#f2ead9;--soft:#a99c87;--line:#3a3229}}
        *{box-sizing:border-box}
        body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
          background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif;padding:24px}
        main{max-width:520px;width:100%}
        .mark{width:44px;height:6px;border-radius:3px;background:var(--accent);margin-bottom:20px}
        h1{font-size:1.4rem;margin:0 0 12px}
        p{margin:0 0 12px;color:var(--soft)}
        .detail{font:13px/1.4 monospace;word-break:break-all}
        nav{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
        .btn{display:inline-block;min-height:44px;padding:11px 18px;border-radius:10px;
          border:1px solid var(--line);color:var(--ink);text-decoration:none}
        .btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
        .start{text-align:center}
        .start h1{font-size:2.2rem;letter-spacing:.02em;margin-top:20px}
        .sun{width:72px;height:72px;margin:0 auto;border-radius:50%;background:#d9a05b;
          box-shadow:0 0 0 8px #efe6d6,0 0 0 13px #3f6b45}
        .note{margin-top:24px;padding:12px 14px;border:1px dashed var(--line);border-radius:10px}
    """.trimIndent()
}
