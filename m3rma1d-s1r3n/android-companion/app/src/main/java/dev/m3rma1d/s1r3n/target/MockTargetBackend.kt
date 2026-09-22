package dev.m3rma1d.s1r3n.target

import dev.m3rma1d.s1r3n.domain.OperationKind

class MockTargetBackend(
    private val appReportsSuccess: Boolean,
) : TargetBackend {
    override suspend fun execute(kind: OperationKind): TargetResult = TargetResult(
        uiActionPerformed = true,
        appReportedSuccess = appReportsSuccess,
        hardwareVerified = false,
        detail = "mock target only: ${kind.name}",
    )
}
