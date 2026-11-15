package af.zuri.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LookalikeTest {
    private fun brand(host: String) = Lookalike.check(host)?.brand?.name

    @Test
    fun fauxSitesSignales() {
        assertEquals("Orange Money", brand("orange-money-bonus.xyz"))
        assertEquals("Orange Money", brand("orangemoney-cm.com"))
        assertEquals("Orange Money", brand("0range-money.com"))
        assertEquals("Orange Money", brand("orange.secure-login.top"))
        assertEquals("Orange Money", brand("orange-money-cm.blogspot.com"))
        assertEquals("MTN MoMo", brand("mtn-momo-promo.top"))
        assertEquals("MTN MoMo", brand("momo-mtn.site"))
        assertEquals("Wave", brand("wave-money-senegal.com"))
        assertEquals("M-Pesa", brand("m-pesa-reversal.co.ke"))
        assertEquals("Ecobank", brand("ecobank-online-verify.com"))
        assertEquals("PayPal", brand("paypaI.com".lowercase().replace('i', '1')))
        assertEquals("PayPal", brand("xn--pypal-4ve.com")) // « pаypal » avec un « а » cyrillique
        assertEquals("Western Union", brand("westernunion-transfert.net"))
        assertEquals("MTN MoMo", brand("mtn-rnomo.top")) // « rn » imite « m »
    }

    @Test
    fun sitesOfficielsIntacts() {
        for (host in listOf(
            "orange.cm", "www.orange.sn", "selfcare.orange.ci", "mtn.cm", "www.mtn.com.gh", "wave.com",
            "safaricom.co.ke", "ecobank.com", "www.paypal.com", "www.westernunion.com", "moneygram.com",
            "airtel.co.ke", "moov-africa.ci"
        )) {
            assertNull(host, Lookalike.check(host))
        }
    }

    @Test
    fun pasDeFaussesAlertes() {
        for (host in listOf(
            "orangecounty.gov", "orange-juice-recipes.com", "microwave.com", "wave-surf.com",
            "mtnbikes.com", "jeuneafrique.com", "jumia.com.ng", "192.168.1.1", "localhost", "lemoovement.org"
        )) {
            assertNull(host, Lookalike.check(host))
        }
    }

    @Test
    fun squelette() {
        assertEquals("orangemoney", Lookalike.skeleton("0range-m0ney"))
        assertEquals("paypal", Lookalike.skeleton("pаypal"))
        assertEquals("pаypal.com", Lookalike.unicode("xn--pypal-4ve.com"))
    }
}
