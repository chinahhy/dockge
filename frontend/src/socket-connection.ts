import { io, Socket } from "socket.io-client";

/**
 * Connect directly with WebSocket to avoid the polling-to-WebSocket transition.
 * Keep long-polling available for proxies that do not support WebSocket.
 * @param url Socket.IO server URL
 * @returns Reconnecting Socket.IO client
 */
export function connectSocket(url: string): Socket {
    return io(url, {
        transports: [ "websocket", "polling" ],
        tryAllTransports: true,
    });
}
