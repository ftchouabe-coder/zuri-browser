package af.zuri.browser

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Log
import java.io.File
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Fichier chiffré au repos (AES-256-GCM) avec une clé non exportable du Keystore Android :
 * même copié hors du téléphone, le fichier est illisible. Équivalent de `safeStorage` sur bureau.
 * Écriture atomique ; un fichier illisible est mis de côté au lieu d'être écrasé.
 */
class SecureStore(context: Context, name: String) {
    private val file = AtomicFile(File(context.filesDir, name))

    fun read(): String? {
        if (!file.baseFile.exists()) return null
        return try {
            val bytes = file.readFully()
            require(bytes.size > MAGIC.size + IV_BYTES && bytes.copyOf(MAGIC.size).contentEquals(MAGIC)) { "format inconnu" }
            val iv = bytes.copyOfRange(MAGIC.size, MAGIC.size + IV_BYTES)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(bytes, MAGIC.size + IV_BYTES, bytes.size - MAGIC.size - IV_BYTES), Charsets.UTF_8)
        } catch (error: Exception) {
            Log.w(TAG, "fichier illisible mis de côté : ${error.message}")
            file.baseFile.renameTo(File(file.baseFile.path + ".illisible-" + System.currentTimeMillis()))
            null
        }
    }

    @Throws(GeneralSecurityException::class)
    fun write(text: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.doFinal(text.toByteArray(Charsets.UTF_8))
        val out = file.startWrite()
        try {
            out.write(MAGIC)
            out.write(cipher.iv)
            out.write(sealed)
            file.finishWrite(out)
        } catch (error: Exception) {
            file.failWrite(out)
            throw error
        }
    }

    fun delete() = file.delete()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val TAG = "ZuriStockage"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "zuri-donnees"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
        val MAGIC = "ZEN1".toByteArray()
    }
}
