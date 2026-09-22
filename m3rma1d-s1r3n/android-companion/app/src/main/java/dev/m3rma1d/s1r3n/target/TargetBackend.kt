package dev.m3rma1d.s1r3n.target

import dev.m3rma1d.s1r3n.domain.OperationKind

data class TargetResult(
    val uiActionPerformed: Boolean,
    val appReportedSuccess: Boolean,
    val hardwareVerified: Boolean,
    val detail: String,
)

fun interface TargetBackend {
    suspend fun execute(kind: OperationKind): TargetResult
}
