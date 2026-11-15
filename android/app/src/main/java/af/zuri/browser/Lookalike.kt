package af.zuri.browser

import java.net.IDN
import java.util.Locale

/**
 * Détection locale des faux sites de mobile money et de banque (« orange-money-bonus.xyz »,
 * « mtn-momo.top », « 0range-money.com », « paypaI.com »…). Aucune requête réseau : le nom d'hôte
 * est comparé à une liste de marques et à leurs domaines officiels.
 *
 * Principe : on « squelettise » l'hôte (caractères trompeurs ramenés à leur lettre latine, tirets
 * retirés), puis on cherche le nom d'une marque. Si le domaine enregistrable n'est pas l'un des
 * domaines officiels *exacts* de la marque, le site est signalé. Les marques au nom courant
 * (Orange, Wave, Moov…) exigent en plus un mot-clé financier, pour éviter les fausses alertes.
 */
object Lookalike {
    data class Brand(
        val name: String,
        /** Premier label des domaines officiels (orange pour orange.cm, orange.sn…). */
        val official: Set<String>,
        val tokens: List<String>,
        /** `null` : la marque seule suffit ; sinon l'un de ces mots-clés est aussi exigé. */
        val keywords: List<String>?,
        /** Exemple affiché à l'utilisateur. */
        val example: String
    )

    data class Match(val brand: Brand, val host: String)

    private val MONEY = listOf("money", "momo", "pay", "cash", "wallet", "transfert", "transfer", "mobilemoney")
    private val ACCOUNT = MONEY + listOf(
        "bank", "banque", "secure", "securite", "login", "signin", "connexion", "verif", "compte", "account",
        "bonus", "promo", "gagn", "cadeau", "gift", "recharge", "credit", "support", "client", "update", "miseajour"
    )

    val BRANDS = listOf(
        Brand("Orange Money", setOf("orange", "orangemoney"), listOf("orangemoney"), null, "orange.cm, orange.sn, orange.ci…"),
        Brand("Orange Money", setOf("orange", "orangemoney"), listOf("orange"), ACCOUNT, "orange.cm, orange.sn, orange.ci…"),
        Brand("MTN MoMo", setOf("mtn", "mtnonline"), listOf("mtnmomo", "momomtn"), null, "mtn.cm, mtn.com.gh, mtn.co.ug…"),
        Brand("MTN MoMo", setOf("mtn", "mtnonline"), listOf("mtn"), ACCOUNT, "mtn.cm, mtn.com.gh, mtn.co.ug…"),
        Brand("Wave", setOf("wave"), listOf("wave"), MONEY, "wave.com"),
        Brand("Moov Money", setOf("moov", "moovafrica"), listOf("moovmoney", "moovafrica"), null, "moov-africa.ci, moov-africa.bj…"),
        Brand("Moov Money", setOf("moov", "moovafrica"), listOf("moov"), MONEY, "moov-africa.ci, moov-africa.bj…"),
        Brand("Airtel Money", setOf("airtel", "airtelafrica"), listOf("airtelmoney"), null, "airtel.africa, airtel.co.ke…"),
        Brand("Airtel Money", setOf("airtel", "airtelafrica"), listOf("airtel"), ACCOUNT, "airtel.africa, airtel.co.ke…"),
        Brand("M-Pesa", setOf("safaricom", "vodacom", "vodafone", "mpesa"), listOf("mpesa"), null, "safaricom.co.ke, vodacom.co.tz…"),
        Brand("Ecobank", setOf("ecobank"), listOf("ecobank"), null, "ecobank.com"),
        Brand("Afriland First Bank", setOf("afrilandfirstbank", "afriland"), listOf("afriland"), null, "afrilandfirstbank.com"),
        Brand("Express Union", setOf("expressunion"), listOf("expressunion"), null, "expressunion.net"),
        Brand("Western Union", setOf("westernunion", "wu"), listOf("westernunion"), null, "westernunion.com"),
        Brand("MoneyGram", setOf("moneygram"), listOf("moneygram"), null, "moneygram.com"),
        Brand("Wizall Money", setOf("wizall"), listOf("wizall"), null, "wizall.com"),
        Brand("PayPal", setOf("paypal", "paypalobjects"), listOf("paypal"), null, "paypal.com")
    )

    /** Caractères qui ressemblent à des lettres latines (cyrillique, grec, chiffres). */
    private val CONFUSABLES = mapOf(
        'а' to 'a', 'е' to 'e', 'о' to 'o', 'р' to 'p', 'с' to 'c', 'х' to 'x', 'у' to 'y', 'і' to 'i',
        'ј' to 'j', 'ԁ' to 'd', 'ӏ' to 'l', 'ɡ' to 'g', 'ո' to 'n', 'ս' to 'u', 'ѕ' to 's', 'һ' to 'h',
        'ο' to 'o', 'α' to 'a', 'ν' to 'v', 'ρ' to 'p', 'ι' to 'i', 'κ' to 'k', 'τ' to 't', 'ε' to 'e',
        '0' to 'o', '1' to 'l', '3' to 'e', '4' to 'a', '5' to 's', '7' to 't', '@' to 'a',
        'à' to 'a', 'á' to 'a', 'â' to 'a', 'ä' to 'a', 'é' to 'e', 'è' to 'e', 'ê' to 'e', 'ë' to 'e',
        'í' to 'i', 'ï' to 'i', 'î' to 'i', 'ó' to 'o', 'ô' to 'o', 'ö' to 'o', 'ú' to 'u', 'ü' to 'u', 'ç' to 'c'
    )

    fun check(host: String): Match? {
        val clean = unicode(host.lowercase(Locale.ROOT).trimEnd('.'))
        if (clean.isEmpty() || clean.all { it.isDigit() || it == '.' || it == ':' }) return null
        val site = DomainSet.siteOf(clean)
        val registrable = site.substringBefore('.').replace("-", "")
        val suffix = site.substringAfter('.', "")
        val name = if (suffix.isEmpty()) clean else clean.removeSuffix(".$suffix")
        val text = skeleton(name)
        for (brand in BRANDS) {
            // Domaine officiel exact (sans normalisation : « 0range » n'est pas « orange »).
            if (registrable in brand.official) continue
            // Noms et mots-clés passent par le même squelette que l'hôte (« western » contient « rn »).
            val tokens = brand.tokens.map(::skeleton)
            if (tokens.none { text.contains(it) }) continue
            val keywords = brand.keywords?.map(::skeleton)
            if (keywords != null && keywords.none { k -> text.contains(k) && tokens.none { it == k } }) continue
            return Match(brand, clean)
        }
        return null
    }

    /** Hôte affichable : `xn--…` (punycode) décodé en Unicode. */
    fun unicode(host: String): String = host.split('.').joinToString(".") { label ->
        if (label.startsWith("xn--")) {
            try {
                IDN.toUnicode(label, IDN.ALLOW_UNASSIGNED)
            } catch (_: IllegalArgumentException) {
                label
            }
        } else {
            label
        }
    }

    fun skeleton(value: String): String {
        val mapped = buildString(value.length) {
            for (c in value.lowercase(Locale.ROOT)) {
                val m = CONFUSABLES[c] ?: c
                if (m in 'a'..'z' || m in '0'..'9') append(m)
            }
        }
        return mapped.replace("rn", "m").replace("vv", "w")
    }
}
