import { broadcastMqttData } from './mqtt_datas_watcher';

// Simulasi data MQTT yang akan dikirim ke client
const dummyData = {
  id_mesin: '123456',
  oxygen_purity: '87.5',
  waktu_mesin: new Date().toISOString(),
  total_flow: '120.9',
};

setInterval(() => {
  console.log('🚀 Injecting dummy MQTT data...');
  broadcastMqttData(dummyData);
}, 5000); // setiap 5 detik kirim data
