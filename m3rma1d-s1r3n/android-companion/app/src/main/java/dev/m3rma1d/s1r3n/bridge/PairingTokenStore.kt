package dev.m3rma1d.s1r3n.bridge

import java.security.SecureRandom
import java.util.Base64

class PairingTokenStore(
    private val random: SecureRandom = SecureRandom(),
) {
    @Volatile
    private var token: String = newToken()

    fun current(): String = token

    @Synchronized
    fun rotate(): String = newToken().also { token = it }

    private fun newToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
