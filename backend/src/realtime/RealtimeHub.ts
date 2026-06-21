/**
 * RealtimeHub — one Durable Object instance per collection name.
 *
 * Uses the WebSocket Hibernation API so idle sockets cost nothing.
 * Each instance is the single broadcast topic for its collection.
 */
export class RealtimeHub implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  /** Accept inbound WebSocket upgrade requests. */
  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation: server socket survives evictions and resumes on message.
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Hibernation callback — invoked when a client sends a message. */
  async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string) {
    let payload: unknown;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      payload = JSON.parse(text);
    } catch {
      payload = { raw: message };
    }

    // Broadcast to every other connected client.
    const announcement = JSON.stringify({
      type: "message",
      data: payload,
      at: Date.now(),
    });

    const sockets = this.state.getWebSockets();
    for (const peer of sockets) {
      if (peer === socket) continue;
      try {
        peer.send(announcement);
      } catch {
        // socket may have closed; ignore — Hibernation will reap it.
      }
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const sockets = this.state.getWebSockets().filter((s) => s !== socket);
    const leave = JSON.stringify({ type: "leave", at: Date.now(), code });
    for (const peer of sockets) {
      try {
        peer.send(leave);
      } catch {
        // ignore
      }
    }
  }
}
