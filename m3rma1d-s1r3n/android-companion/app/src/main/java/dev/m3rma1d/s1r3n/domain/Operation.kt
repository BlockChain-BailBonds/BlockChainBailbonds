package dev.m3rma1d.s1r3n.domain

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

@Serializable(with = OperationIdSerializer::class)
@JvmInline
value class OperationId(val value: String)

object OperationIdSerializer : KSerializer<OperationId> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("OperationId", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: OperationId) = encoder.encodeString(value.value)
    override fun deserialize(decoder: Decoder): OperationId = OperationId(decoder.decodeString())
}

@Serializable
enum class OperationKind {
    DISCOVER_APPS,
    INSPECT_DEVICE,
    SELECT_FIRMWARE,
    VALIDATE_FIRMWARE,
    FLASH_FIRMWARE,
    INSTALL_FLIPPER_APP,
    OPEN_CONSOLE,
    RUN_SUPPORTED_ACTION,
}

@Serializable
enum class OperationState {
    REQUESTED,
    VALIDATED,
    AWAITING_CONFIRMATION,
    EXECUTING,
    SUCCEEDED,
    FAILED,
    CANCELLED,
    UNKNOWN,
}

@Serializable
data class Evidence(
    val kind: String,
    val detail: String,
    val atEpochMs: Long,
)

@Serializable
data class Operation(
    val id: OperationId,
    val kind: OperationKind,
    val state: OperationState,
    val evidence: List<Evidence> = emptyList(),
) {
    fun transitionTo(next: OperationState): Operation {
        check(state !in TERMINAL_STATES) { "Terminal operation ${id.value} cannot transition" }
        return copy(state = next)
    }

    private companion object {
        val TERMINAL_STATES = setOf(
            OperationState.SUCCEEDED,
            OperationState.FAILED,
            OperationState.CANCELLED,
            OperationState.UNKNOWN,
        )
    }
}
