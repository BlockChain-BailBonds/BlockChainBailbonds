package dev.m3rma1d.s1r3n.bridge

import dev.m3rma1d.s1r3n.domain.EmergencyStop
import dev.m3rma1d.s1r3n.domain.OperationRegistry
import java.net.InetAddress
import java.net.Socket
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.junit.Test

class LoopbackBridgeTest {
    @Test
    fun `bridge rejects non-loopback bind and oversized body`() {
        assertFailsWith<IllegalArgumentException> {
            LoopbackBridge(InetAddress.getByName("0.0.0.0"), 0, dependencies())
        }

        bridge().use { running ->
            val response = request(running.port, "POST", "/v1/operations", "x".repeat(65_537), "valid")
            assertEquals(413, response.code)
        }
    }

    @Test
    fun `bridge requires pairing token and survives malformed JSON`() {
        bridge().use { running ->
            assertEquals(401, request(running.port, "POST", "/v1/operations", "{}", "wrong").code)
            assertEquals(400, request(running.port, "POST", "/v1/operations", "{", "valid").code)
            assertEquals(200, request(running.port, "GET", "/v1/health").code)
        }
    }

    private fun bridge(): LoopbackBridge =
        LoopbackBridge(InetAddress.getLoopbackAddress(), 0, dependencies()).apply { start() }

    private fun dependencies() = BridgeDependencies(
        registry = OperationRegistry(),
        emergencyStop = EmergencyStop(),
        currentToken = { "valid" },
    )

    private fun request(port: Int, method: String, path: String, body: String = "", token: String? = null): TestResponse {
        Socket(InetAddress.getLoopbackAddress(), port).use { socket ->
            socket.soTimeout = 3_000
            val bodyBytes = body.toByteArray()
            val headers = buildString {
                append("$method $path HTTP/1.1\r\nHost: 127.0.0.1\r\n")
                if (token != null) append("Authorization: Bearer $token\r\n")
                append("Content-Length: ${bodyBytes.size}\r\nConnection: close\r\n\r\n")
            }.toByteArray()
            socket.getOutputStream().apply { write(headers); write(bodyBytes); flush() }
            val raw = socket.getInputStream().readBytes().toString(Charsets.UTF_8)
            val code = raw.lineSequence().first().split(' ')[1].toInt()
            return TestResponse(code, raw.substringAfter("\r\n\r\n"))
        }
    }
}

private data class TestResponse(val code: Int, val body: String)
