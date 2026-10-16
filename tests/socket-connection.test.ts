import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Server } from "socket.io";
import { connectSocket } from "../frontend/src/socket-connection";

test("connects directly over WebSocket without opening a polling session", { timeout: 10000 }, async (t) => {
    const http = createServer();
    const server = new Server(http);
    let pollingRequests = 0;
    http.on("request", (req) => {
        if (req.url?.includes("transport=polling")) {
            pollingRequests++;
        }
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const client = connectSocket(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
    t.after(async () => {
        client.disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    await once(client, "connect");
    assert.equal(client.io.engine.transport.name, "websocket");
    assert.equal(pollingRequests, 0);
});

test("falls back to polling when the server rejects WebSocket", { timeout: 10000 }, async (t) => {
    const http = createServer();
    const server = new Server(http, {
        transports: [ "polling" ],
        allowUpgrades: false,
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const client = connectSocket(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
    t.after(async () => {
        client.disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    await once(client, "connect");
    assert.equal(client.io.engine.transport.name, "polling");
    assert.equal(server.engine.clientsCount, 1);
});

test("reconnects over WebSocket and exchanges events after a transport loss", { timeout: 10000 }, async (t) => {
    const http = createServer();
    const server = new Server(http);
    let connections = 0;
    server.on("connection", (socket) => {
        connections++;
        socket.on("probe", (reply) => reply("ok"));
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const client = connectSocket(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
    t.after(async () => {
        client.disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    await once(client, "connect");
    const originalID = client.id;
    const disconnected = once(client, "disconnect");
    server.sockets.sockets.get(originalID!)!.conn.close();
    await disconnected;
    await once(client, "connect");
    assert.notEqual(client.id, originalID);
    assert.equal(client.io.engine.transport.name, "websocket");
    assert.equal(connections, 2);
    const response = await client.timeout(1000).emitWithAck("probe");
    assert.equal(response, "ok");
});
