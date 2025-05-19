import { clients } from './websocket';

export async function broadcastMqttData(newData: any) {
  for (const [ws, client] of clients.entries()) {
    if (client.id_mesin.includes(newData.id_mesin)) {
      ws.send(
        JSON.stringify({
          type: 'mqtt_data',
          data: newData,
        })
      );
      console.log(`📡 Data sent to client for mesin: ${newData.id_mesin}`);
    }
  }
}
