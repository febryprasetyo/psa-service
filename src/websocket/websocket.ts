import WebSocket, { WebSocketServer } from 'ws';

interface ClientInfo {
  id_mesin: string[];
}

const wss = new WebSocketServer({ port: 8080 });
const clients: Map<WebSocket, ClientInfo> = new Map();

wss.on('connection', (ws) => {
  console.log('✅ WebSocket client connected');
  clients.set(ws, { id_mesin: [] });

  // Client wajib kirim id_mesin setelah connect
  ws.on('message', (message: string) => {
    try {
      const parsed = JSON.parse(message);

      // Format: { type: 'register', id_mesin: ['id1', 'id2'] }
      if (parsed.type === 'register' && Array.isArray(parsed.id_mesin)) {
        clients.set(ws, { id_mesin: parsed.id_mesin });
        console.log(
          `✅ Client registered id_mesin: ${parsed.id_mesin.join(', ')}`
        );
      }
    } catch (err) {
      console.error('❌ Failed to parse client message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('❌ WebSocket client disconnected');
  });
});

export { clients };
