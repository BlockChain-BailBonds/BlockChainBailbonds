package dev.m3rma1d.s1r3n.domain

import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test

class AuthorityPolicyTest {
    @Test
    fun `confirmation is operation-bound one-use and expires`() {
        val clock = MutableClock(1_000)
        val store = ConfirmationStore(clock, ttlMs = 500)
        store.grant(OperationId("a"))

        assertFalse(store.consume(OperationId("b")))
        assertTrue(store.consume(OperationId("a")))
        assertFalse(store.consume(OperationId("a")))

        store.grant(OperationId("c"))
        clock.now = 1_501
        assertFalse(store.consume(OperationId("c")))
    }

    @Test
    fun `emergency stop rejects mutation but permits inspection`() {
        val stop = EmergencyStop().apply { engage() }

        assertFalse(stop.mayStart(OperationKind.FLASH_FIRMWARE))
        assertTrue(stop.mayStart(OperationKind.INSPECT_DEVICE))
    }
}

private class MutableClock(var now: Long) : Clock {
    override fun nowMs(): Long = now
}
