package dev.m3rma1d.s1r3n.domain

import kotlin.test.assertFailsWith
import org.junit.Test

class OperationTest {
    @Test
    fun `terminal operation cannot transition`() {
        val done = Operation(OperationId("op-1"), OperationKind.INSPECT_DEVICE, OperationState.SUCCEEDED)

        assertFailsWith<IllegalStateException> { done.transitionTo(OperationState.EXECUTING) }
    }
}
