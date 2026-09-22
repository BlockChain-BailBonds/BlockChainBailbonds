package dev.m3rma1d.s1r3n.domain

import dev.m3rma1d.s1r3n.bridge.BridgeRequest

class OperationRegistry {
    private val entries = linkedMapOf<String, Operation>()

    @Synchronized
    fun createOrGet(request: BridgeRequest): Operation =
        entries.getOrPut(request.requestId) {
            Operation(OperationId(request.requestId), request.operation, OperationState.REQUESTED)
        }

    @Synchronized
    fun all(): List<Operation> = entries.values.toList()

    @Synchronized
    fun find(id: OperationId): Operation? = entries[id.value]
}
