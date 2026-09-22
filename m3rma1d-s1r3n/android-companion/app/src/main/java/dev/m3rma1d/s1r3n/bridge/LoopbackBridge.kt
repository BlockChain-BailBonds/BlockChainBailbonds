package dev.m3rma1d.s1r3n.bridge

import dev.m3rma1d.s1r3n.domain.AuthorityPolicy
import dev.m3rma1d.s1r3n.domain.EmergencyStop
import dev.m3rma1d.s1r3n.domain.OperationId
import dev.m3rma1d.s1r3n.domain.OperationRegistry
import java.io.Closeable
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class BridgeDependencies(
    val registry: OperationRegistry,
    val emergencyStop: EmergencyStop,
    val currentToken: () -> String,
)

class LoopbackBridge(
    bindAddress: InetAddress,
    requestedPort: Int,
    private val dependencies: BridgeDependencies,
    private val json: Json = Json { ignoreUnknownKeys = false },
) : Closeable {
    private val running = AtomicBoolean(false)
    private val server: ServerSocket
    private val workers = Executors.newCachedThreadPool { task ->
        Thread(task, "m3s-bridge-worker").apply { isDaemon = true }
    }

    val port: Int get() = server.localPort

    init {
        require(bindAddress.isLoopbackAddress) { "Bridge must bind to loopback" }
        server = ServerSocket(requestedPort, BACKLOG, bindAddress)
    }

    fun start() {
        check(running.compareAndSet(false, true)) { "Bridge already started" }
        Thread(::acceptLoop, "m3s-bridge-accept").apply { isDaemon = true }.start()
    }

    private fun acceptLoop() {
        while (running.get()) {
            try {
                val socket = server.accept()
                workers.execute { handle(socket) }
            } catch (_: SocketException) {
                if (running.get()) continue
            }
        }
    }

    private fun handle(socket: Socket) {
        socket.use {
            it.soTimeout = SOCKET_TIMEOUT_MS
            try {
                val request = readRequest(it.getInputStream())
                route(request, it)
            } catch (error: HttpFailure) {
                writeResponse(it, error.code, BridgeError(error.reason, error.safeMessage))
            } catch (_: Exception) {
                writeResponse(it, 400, BridgeError("bad_request", "Malformed request"))
            }
        }
    }

    private fun route(request: HttpRequest, socket: Socket) {
        if (request.method == "GET" && request.path == "/v1/health") {
            writeRawResponse(socket, 200, "{\"status\":\"ok\"}")
            return
        }
        if (!authorized(request.authorization)) throw HttpFailure(401, "unauthorized", "Unauthorized")

        when {
            request.method == "POST" && request.path == "/v1/operations" -> {
                val bridgeRequest = try {
                    json.decodeFromString<BridgeRequest>(request.body)
                } catch (_: SerializationException) {
                    throw HttpFailure(400, "invalid_json", "Invalid operation request")
                }
                if (!dependencies.emergencyStop.mayStart(bridgeRequest.operation)) {
                    throw HttpFailure(409, "emergency_stop", "Mutation blocked by emergency stop")
                }
                val operation = dependencies.registry.createOrGet(bridgeRequest)
                writeResponse(socket, 200, BridgeResponse(operation = operation))
            }
            request.method == "GET" && request.path.startsWith("/v1/operations/") -> {
                val id = request.path.removePrefix("/v1/operations/")
                val operation = dependencies.registry.find(OperationId(id))
                    ?: throw HttpFailure(404, "not_found", "Operation not found")
                writeResponse(socket, 200, BridgeResponse(operation = operation))
            }
            request.method == "POST" && request.path == "/v1/emergency-stop" -> {
                dependencies.emergencyStop.engage()
                writeRawResponse(socket, 200, "{\"engaged\":true}")
            }
            else -> throw HttpFailure(404, "not_found", "Route not found")
        }
    }

    private fun authorized(header: String?): Boolean {
        val supplied = header?.removePrefix("Bearer ") ?: return false
        return MessageDigest.isEqual(supplied.toByteArray(), dependencies.currentToken().toByteArray())
    }

    private fun readRequest(input: InputStream): HttpRequest {
        val headerBytes = ArrayList<Byte>()
        var matched = 0
        val delimiter = byteArrayOf(13, 10, 13, 10)
        while (matched < delimiter.size) {
            val next = input.read()
            if (next < 0) throw HttpFailure(400, "bad_request", "Incomplete headers")
            headerBytes += next.toByte()
            if (headerBytes.size > MAX_HEADER_BYTES) throw HttpFailure(413, "headers_too_large", "Headers too large")
            matched = if (next.toByte() == delimiter[matched]) matched + 1 else if (next == 13) 1 else 0
        }
        val lines = headerBytes.toByteArray().toString(Charsets.US_ASCII).dropLast(4).split("\r\n")
        val requestLine = lines.firstOrNull()?.split(' ') ?: emptyList()
        if (requestLine.size != 3 || requestLine[2] != "HTTP/1.1") throw HttpFailure(400, "bad_request", "Invalid request line")
        val headers = lines.drop(1).associate { line ->
            val separator = line.indexOf(':')
            if (separator <= 0) throw HttpFailure(400, "bad_request", "Invalid header")
            line.substring(0, separator).trim().lowercase() to line.substring(separator + 1).trim()
        }
        val contentLength = headers["content-length"]?.toIntOrNull()
            ?: if (requestLine[0] == "GET") 0 else throw HttpFailure(400, "bad_request", "Missing content length")
        if (contentLength < 0) throw HttpFailure(400, "bad_request", "Invalid content length")
        if (contentLength > MAX_BODY_BYTES) throw HttpFailure(413, "body_too_large", "Request body too large")
        val body = ByteArray(contentLength)
        var offset = 0
        while (offset < contentLength) {
            val count = input.read(body, offset, contentLength - offset)
            if (count < 0) throw HttpFailure(400, "bad_request", "Incomplete body")
            offset += count
        }
        return HttpRequest(requestLine[0], requestLine[1], headers["authorization"], body.toString(Charsets.UTF_8))
    }

    private inline fun <reified T> writeResponse(socket: Socket, code: Int, value: T) =
        writeRawResponse(socket, code, json.encodeToString(value))

    private fun writeRawResponse(socket: Socket, code: Int, body: String) {
        val payload = body.toByteArray()
        val status = when (code) {
            200 -> "OK"
            400 -> "Bad Request"
            401 -> "Unauthorized"
            404 -> "Not Found"
            409 -> "Conflict"
            413 -> "Payload Too Large"
            else -> "Error"
        }
        val headers = "HTTP/1.1 $code $status\r\nContent-Type: application/json\r\nContent-Length: ${payload.size}\r\nConnection: close\r\n\r\n"
        socket.getOutputStream().apply { write(headers.toByteArray()); write(payload); flush() }
    }

    override fun close() {
        running.set(false)
        server.close()
        workers.shutdownNow()
    }

    private data class HttpRequest(val method: String, val path: String, val authorization: String?, val body: String)
    private class HttpFailure(val code: Int, val reason: String, val safeMessage: String) : Exception()

    private companion object {
        const val BACKLOG = 16
        const val MAX_HEADER_BYTES = 8 * 1024
        const val MAX_BODY_BYTES = 65_536
        const val SOCKET_TIMEOUT_MS = 3_000
    }
}
