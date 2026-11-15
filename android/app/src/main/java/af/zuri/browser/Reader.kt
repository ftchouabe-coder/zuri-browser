package af.zuri.browser

/** Bloc de texte d'un article : titre (h), paragraphe (p), élément de liste (l), citation (q). */
data class Block(val kind: Char, val text: String)

data class Article(val url: String, val title: String, val lang: String, val blocks: List<Block>, val savedAt: Long = 0)

/**
 * Mode lecture : le texte de l'article est extrait de la page, puis réaffiché dans une page
 * interne sans script. Tout le contenu est échappé : une page piégée ne peut rien injecter.
 */
object Reader {
    /** Script d'extraction (exécuté dans la page) ; renvoie un JSON ou `null`. */
    const val EXTRACT_JS = """(function(){
function t(e){return (e.innerText||e.textContent||'').replace(/\s+/g,' ').trim();}
function sc(e){var s=0;e.querySelectorAll('p').forEach(function(p){var l=t(p).length;if(l>40)s+=l;});return s;}
var best=null,score=0;
document.querySelectorAll('article,main,[role=main],.post,.article,.entry-content,.post-content,.article-body,.article-content,#content').forEach(function(e){var s=sc(e);if(s>score){score=s;best=e;}});
if(!best||score<500){var m=new Map();document.querySelectorAll('p').forEach(function(p){var l=t(p).length;if(l<40)return;var k=p.parentElement;m.set(k,(m.get(k)||0)+l);});m.forEach(function(v,k){if(v>score){score=v;best=k;}});}
if(!best||score<300)return JSON.stringify(null);
var out=[];
best.querySelectorAll('h1,h2,h3,h4,p,li,blockquote').forEach(function(e){
if(out.length>=600)return;
if(e.closest('nav,aside,footer,form,figcaption,table,[aria-hidden=true],.share,.social,.related,.comments,.newsletter,.infobox,.navbox,.metadata,.thumb,.toc,#toc,.mw-editsection,.references,.reflist,.noprint'))return;
if(e.tagName!=='H1'&&e.tagName.charAt(0)!=='H'&&e.querySelector('p,li'))return;
var x=t(e);if(x.length<2)return;
var g=e.tagName,k=g.charAt(0)==='H'?'h':g==='LI'?'l':g==='BLOCKQUOTE'?'q':'p';
out.push([k,x.slice(0,5000)]);});
var h=document.querySelector('h1');
return JSON.stringify({title:((h&&t(h))||document.title||'').slice(0,300),lang:(document.documentElement.lang||'').slice(0,12),blocks:out});
})()"""

    private val FOOTNOTE = Regex("\\[(\\d{1,3}|[a-z]|réf\\.? nécessaire|citation needed|note \\d+)]", RegexOption.IGNORE_CASE)
    private val NO_CONTENT = Regex("^[\\p{P}\\p{S}\\d\\s]*$")

    /** Retire les renvois de notes (« [3] ») et les blocs sans texte réel (« [1]) », « — »). */
    fun clean(blocks: List<Block>): List<Block> = blocks.mapNotNull { block ->
        val text = block.text.replace(FOOTNOTE, "").replace(Regex("\\s+([,.;:)])"), "$1").replace(Regex("\\s{2,}"), " ").trim()
        if (text.isEmpty() || NO_CONTENT.matches(text)) null else block.copy(text = text)
    }

    fun minutes(article: Article): Int {
        val words = article.blocks.sumOf { b -> b.text.split(' ').count { it.isNotBlank() } }
        return maxOf(1, (words + 199) / 200)
    }

    fun html(article: Article, labels: Labels): String {
        val e = Pages::escape
        val body = buildString {
            val host = if (UrlInput.isHttp(article.url)) UrlInput.hostOf(article.url)?.removePrefix("www.") else null
            append("<article><p class=\"meta\">")
            host?.let { append(e(it)).append(" · ") }
            append(e(labels.minutes(minutes(article)))).append("</p>")
            append("<h1>").append(e(article.title)).append("</h1>")
            var inList = false
            for (block in article.blocks) {
                if (block.kind == 'l' && !inList) { append("<ul>"); inList = true }
                if (block.kind != 'l' && inList) { append("</ul>"); inList = false }
                // Le titre principal est déjà affiché en tête.
                if (block.kind == 'h' && block.text == article.title) continue
                when (block.kind) {
                    'h' -> append("<h2>").append(e(block.text)).append("</h2>")
                    'l' -> append("<li>").append(e(block.text)).append("</li>")
                    'q' -> append("<blockquote>").append(e(block.text)).append("</blockquote>")
                    else -> append("<p>").append(e(block.text)).append("</p>")
                }
            }
            if (inList) append("</ul>")
            if (UrlInput.isHttp(article.url)) {
                append("<p class=\"source\"><a href=\"").append(e(article.url)).append("\">").append(e(labels.original)).append("</a></p>")
            }
            labels.note?.let { append("<p class=\"note\">").append(e(it)).append("</p>") }
            append("</article>")
        }
        val lang = article.lang.takeIf { it.matches(Regex("^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$")) } ?: labels.lang
        return "<!doctype html><html lang=\"${e(lang)}\"><head><meta charset=\"utf-8\">" +
            "<meta http-equiv=\"Content-Security-Policy\" content=\"${Pages.CSP}\">" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
            "<meta name=\"referrer\" content=\"no-referrer\"><title>${e(article.title)}</title>" +
            "<style>$STYLE</style></head><body>$body</body></html>"
    }

    /** Morceaux de texte pour la synthèse vocale (les moteurs limitent la longueur d'un énoncé). */
    fun speechChunks(article: Article, max: Int = 3000): List<String> {
        val parts = listOf(article.title) + article.blocks.filter { it.text != article.title }.map { it.text }
        val chunks = mutableListOf<String>()
        val current = StringBuilder()
        for (part in parts.flatMap { split(it, max) }) {
            if (current.isNotEmpty() && current.length + part.length + 1 > max) {
                chunks += current.toString()
                current.clear()
            }
            if (current.isNotEmpty()) current.append('\n')
            current.append(part)
        }
        if (current.isNotEmpty()) chunks += current.toString()
        return chunks
    }

    private fun split(text: String, max: Int): List<String> {
        if (text.length <= max) return listOf(text)
        val out = mutableListOf<String>()
        var rest = text
        while (rest.length > max) {
            val cut = rest.lastIndexOf(". ", max).takeIf { it > max / 2 }?.plus(1) ?: rest.lastIndexOf(' ', max).takeIf { it > 0 } ?: max
            out += rest.substring(0, cut).trim()
            rest = rest.substring(cut).trim()
        }
        if (rest.isNotEmpty()) out += rest
        return out
    }

    data class Labels(val lang: String, val original: String, val minutes: (Int) -> String, val note: String? = null)

    private val STYLE = """
        :root{--bg:#faf7f0;--ink:#1b1917;--soft:#6d6355;--line:#dcd0bb;--accent:#24325b;color-scheme:light dark}
        @media (prefers-color-scheme:dark){:root{--bg:#1f1b17;--ink:#f2ead9;--soft:#a99c87;--line:#3a3229;--accent:#8fa3d6}}
        body{margin:0;background:var(--bg);color:var(--ink);font:19px/1.65 Georgia,'Noto Serif',serif;padding:20px 18px 48px}
        article{max-width:680px;margin:0 auto}
        h1{font:700 1.55rem/1.25 system-ui,sans-serif;margin:.2em 0 .8em}
        h2{font:700 1.15rem/1.3 system-ui,sans-serif;margin:1.6em 0 .5em}
        p,li{margin:0 0 1em}
        ul{padding-left:1.2em}
        blockquote{margin:1em 0;padding-left:1em;border-left:3px solid var(--line);color:var(--soft)}
        .meta{font:14px system-ui,sans-serif;color:var(--soft);margin:0}
        .source{margin-top:2em;font:15px system-ui,sans-serif}
        .source a{color:var(--accent)}
        .note{margin-top:1.5em;padding:12px 14px;border:1px dashed var(--line);border-radius:10px;font:14px system-ui,sans-serif;color:var(--soft)}
    """.trimIndent()
}
