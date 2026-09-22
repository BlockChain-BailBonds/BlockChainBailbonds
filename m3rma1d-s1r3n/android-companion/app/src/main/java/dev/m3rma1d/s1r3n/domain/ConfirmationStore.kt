package dev.m3rma1d.s1r3n.domain

fun interface Clock {
    fun nowMs(): Long
}

class ConfirmationStore(
    private val clock: Clock,
    private val ttlMs: Long = 60_000,
) {
    private val grants = mutableMapOf<OperationId, Long>()

    init {
        require(ttlMs > 0) { "Confirmation TTL must be positive" }
    }

    @Synchronized
    fun grant(id: OperationId) {
        grants[id] = clock.nowMs() + ttlMs
    }

    @Synchronized
    fun consume(id: OperationId): Boolean =
        grants.remove(id)?.let { expiresAt -> expiresAt >= clock.nowMs() } == true
}
