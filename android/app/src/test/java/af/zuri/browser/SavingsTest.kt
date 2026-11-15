package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Locale

class SavingsTest {
    @Test
    fun compteurMensuel() {
        val counter = SavingsCounter("2026-11", 10)
        counter.add("2026-11", 5)
        assertEquals("2026-11" to 15L, counter.snapshot("2026-11"))
        counter.add("2026-12")
        assertEquals("nouveau mois", "2026-12" to 1L, counter.snapshot("2026-12"))
        assertEquals("2027-01" to 0L, counter.snapshot("2027-01"))
    }

    @Test
    fun formats() {
        val cm = Locale("fr", "CM")
        assertEquals("FCFA", Savings.currencySymbol(cm))
        assertEquals("FCFA", Savings.currencySymbol(Locale("fr", "SN")))
        val bytes = Savings.bytes(1000) // 1000 éléments ≈ 14,6 Mo
        assertEquals("15 Mo", Savings.formatSize(bytes, cm))
        assertEquals("1,5 Mo", Savings.formatSize(Savings.bytes(100), cm))
        assertNull(Savings.formatCost(bytes, 0, cm))
        assertEquals("14 FCFA", Savings.formatCost(bytes, 1000, cm))
        assertEquals("1,4 FCFA", Savings.formatCost(Savings.bytes(100), 1000, cm))
        assertEquals("15 MB", Savings.formatSize(bytes, Locale.US))
    }
}
