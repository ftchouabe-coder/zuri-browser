package af.zuri.browser

import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Fichier de sauvegarde chiffré par mot de passe, transportable d'un téléphone à l'autre
 * (contrairement aux fichiers internes, liés au Keystore de l'appareil).
 *
 * Format : `ZBK1` | itérations (4 octets) | sel (16) | IV (12) | AES-256-GCM(données).
 * La clé est dérivée par PBKDF2-HMAC-SHA256 ; l'en-tête entier est authentifié (AAD), si bien
 * qu'un fichier modifié — même seulement son nombre d'itérations — est refusé.
 */
object BackupCrypto {
    const val DEFAULT_ITERATIONS = 310_000
    private const val MIN_ITERATIONS = 100_000
    private const val MAX_ITERATIONS = 5_000_000
    private val MAGIC = "ZBK1".toByteArray()
    private const val HEADER = 4 + 4 + 16 + 12

    class WrongPassword : Exception("mot de passe incorrect ou fichier modifié")
    class InvalidFile : Exception("ce fichier n'est pas une sauvegarde Zuri")

    fun seal(plain: ByteArray, password: CharArray, iterations: Int = DEFAULT_ITERATIONS): ByteArray {
        val random = SecureRandom()
        val salt = ByteArray(16).also(random::nextBytes)
        val iv = ByteArray(12).also(random::nextBytes)
        val header = ByteBuffer.allocate(HEADER).put(MAGIC).putInt(iterations).put(salt).put(iv).array()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, derive(password, salt, iterations), GCMParameterSpec(128, iv))
        cipher.updateAAD(header)
        return header + cipher.doFinal(plain)
    }

    fun open(data: ByteArray, password: CharArray): ByteArray {
        if (data.size <= HEADER + 16 || !data.copyOf(4).contentEquals(MAGIC)) throw InvalidFile()
        val buffer = ByteBuffer.wrap(data, 4, HEADER - 4)
        val iterations = buffer.int
        if (iterations !in MIN_ITERATIONS..MAX_ITERATIONS && iterations != TEST_ITERATIONS) throw InvalidFile()
        val salt = ByteArray(16).also { buffer.get(it) }
        val iv = ByteArray(12).also { buffer.get(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, derive(password, salt, iterations), GCMParameterSpec(128, iv))
        cipher.updateAAD(data, 0, HEADER)
        return try {
            cipher.doFinal(data, HEADER, data.size - HEADER)
        } catch (_: AEADBadTagException) {
            throw WrongPassword()
        }
    }

    /** Valeur réservée aux tests unitaires (dérivation rapide). */
    internal const val TEST_ITERATIONS = 1_000

    private fun derive(password: CharArray, salt: ByteArray, iterations: Int): SecretKeySpec {
        val spec = PBEKeySpec(password, salt, iterations, 256)
        try {
            val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
            return SecretKeySpec(bytes, "AES")
        } finally {
            spec.clearPassword()
        }
    }
}
