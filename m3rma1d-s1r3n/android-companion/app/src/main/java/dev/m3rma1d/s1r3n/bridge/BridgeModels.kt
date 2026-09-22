package dev.m3rma1d.s1r3n.bridge

import dev.m3rma1d.s1r3n.domain.Operation
import dev.m3rma1d.s1r3n.domain.OperationKind
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class BridgeRequest(
    val requestId: String,
    val operation: OperationKind,
    val arguments: JsonObject,
)

@Serializable
data class BridgeError(
    val code: String,
    val message: String,
)

@Serializable
data class BridgeResponse(
    val operation: Operation? = null,
    val error: BridgeError? = null,
)
