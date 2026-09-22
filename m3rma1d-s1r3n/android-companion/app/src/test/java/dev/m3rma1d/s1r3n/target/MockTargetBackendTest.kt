package dev.m3rma1d.s1r3n.target

import dev.m3rma1d.s1r3n.domain.OperationKind
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import org.junit.Test

class MockTargetBackendTest {
    @Test
    fun `tap success is not hardware success`() = runBlocking {
        val result = MockTargetBackend(appReportsSuccess = true).execute(OperationKind.RUN_SUPPORTED_ACTION)

        assertTrue(result.uiActionPerformed)
        assertTrue(result.appReportedSuccess)
        assertFalse(result.hardwareVerified)
    }
}
