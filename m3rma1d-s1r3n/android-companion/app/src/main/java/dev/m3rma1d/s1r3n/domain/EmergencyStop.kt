package dev.m3rma1d.s1r3n.domain

class EmergencyStop {
    @Volatile
    var isEngaged: Boolean = false
        private set

    fun engage() {
        isEngaged = true
    }

    fun reset() {
        isEngaged = false
    }

    fun mayStart(kind: OperationKind): Boolean =
        !isEngaged || !AuthorityPolicy.requiresConfirmation(kind)
}
