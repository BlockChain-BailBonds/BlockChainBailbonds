package dev.m3rma1d.s1r3n.domain

object AuthorityPolicy {
    private val mutating = setOf(
        OperationKind.FLASH_FIRMWARE,
        OperationKind.INSTALL_FLIPPER_APP,
        OperationKind.RUN_SUPPORTED_ACTION,
    )

    fun requiresConfirmation(kind: OperationKind): Boolean = kind in mutating
}
