package af.zuri.browser

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Compteur mensuel des éléments bloqués (publicités, traqueurs, sites signalés). Incrémenté depuis
 * le fil réseau : aucune adresse n'est conservée, seulement un nombre. Remis à zéro chaque mois.
 */
class SavingsCounter(private var month: String, private var count: Long) {
    @Synchronized
    fun add(nowMonth: String, n: Long = 1) {
        roll(nowMonth)
        count += n
    }

    @Synchronized
    fun snapshot(nowMonth: String): Pair<String, Long> {
        roll(nowMonth)
        return month to count
    }

    private fun roll(nowMonth: String) {
        if (nowMonth != month) {
            month = nowMonth
            count = 0
        }
    }
}

object Savings {
    /**
     * Taille moyenne retenue pour un élément bloqué. Volontairement prudente : un script de
     * publicité pèse souvent 30 à 100 Ko, un pixel de suivi moins de 1 Ko, et le blocage évite
     * aussi les chargements en cascade, qui ne sont pas comptés ici.
     */
    const val AVERAGE_BLOCKED_BYTES = 15 * 1024L

    fun bytes(count: Long): Long = count * AVERAGE_BLOCKED_BYTES

    fun formatSize(bytes: Long, locale: Locale): String {
        val mb = bytes / (1024.0 * 1024.0)
        val number = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = if (mb < 10) 1 else 0 }
        val unit = if (locale.language == "fr") "Mo" else "MB"
        return number.format(mb) + " " + unit
    }

    /** Coût évité, ou `null` si le prix du Go n'est pas renseigné. */
    fun formatCost(bytes: Long, pricePerGb: Int, locale: Locale): String? {
        if (pricePerGb <= 0) return null
        val amount = bytes / (1024.0 * 1024.0 * 1024.0) * pricePerGb
        val symbol = currencySymbol(locale)
        val number = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = if (amount < 10) 1 else 0 }
        return number.format(amount) + " " + symbol
    }

    /** Franc CFA pour les pays de la zone (XAF/XOF), sinon le symbole local. */
    fun currencySymbol(locale: Locale): String {
        val code = try {
            if (locale.country.isEmpty()) null else Currency.getInstance(locale).currencyCode
        } catch (_: IllegalArgumentException) {
            null
        }
        return when (code) {
            "XAF", "XOF" -> "FCFA"
            null -> ""
            else -> Currency.getInstance(code).getSymbol(locale)
        }.ifEmpty { "¤" }
    }
}
