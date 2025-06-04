import * as Mqtt from 'mqtt';
import { db, moment } from '../utils/util';
import { extractSensorValues } from '../utils/mqttData';
import { Topic2Data } from '../types/types';
import 'dotenv/config';
import { chunk } from 'lodash';

const brokerUrl = process.env.MQTT_BROKER_URL!;
const options = {
  port: parseInt(process.env.MQTT_PORT || '1883'),
  keepalive: parseInt(process.env.MQTT_KEEP_ALIVE || '60'),
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

const INSERT_INTERVAL_MS = 60_000;
const CHUNK_SIZE = 50;

function safeFixed(value: any, decimal = 2): string | null {
  const num = parseFloat(value);
  return isNaN(num) ? null : num.toFixed(decimal);
}

class MqttHandler {
  public mqttClient: any;
  // Buffer menyimpan satu data per topik per menit
  private buffers: Map<string, { minute: string; data: any }> = new Map();

  async getAllTopics(): Promise<string[]> {
    const rows = await db('machines').select('id_mesin', 'manufacture');
    return rows.map((row: { manufacture: string; id_mesin: any }) =>
      row.manufacture?.toLowerCase() === 'mgm'
        ? `data/psa/O2generatorMGM/${row.id_mesin}`
        : row.id_mesin
    );
  }

  async connect() {
    const topics = await this.getAllTopics();
    if (!topics.length) {
      console.warn('⚠️ No topics found.');
      return;
    }

    this.mqttClient = Mqtt.connect(brokerUrl, options);

    this.mqttClient.on('connect', () => {
      console.log('✅ MQTT connected');

      topics.forEach((topic) => {
        this.mqttClient.subscribe(topic, (err: Error | null) => {
          if (err) console.error(`❌ Failed to subscribe: ${topic}`, err);
          else console.log(`📡 Subscribed: ${topic}`);
        });
      });

      // Global interval untuk menyimpan semua data buffered
      setInterval(() => this.flushAllBuffers(), INSERT_INTERVAL_MS);
    });

    this.mqttClient.on('message', async (topic: string, message: Buffer) => {
      try {
        const jsonData = JSON.parse(message.toString());
        const id_mesin = topic.includes('/') ? topic.split('/').pop()! : topic;
        const mesin = await db('machines')
          .select('nama_dinas')
          .where({ id_mesin })
          .first();
        const nama_dinas = mesin?.nama_dinas || null;

        const waktu_mesin = jsonData['_terminalTime'] || moment().format();
        const currentMinute = moment(waktu_mesin).format('YYYY-MM-DD HH:mm');

        const isMGM = topic.startsWith('data/psa/O2generatorMGM/');
        const data = isMGM
          ? {
              id_mesin,
              waktu_mesin,
              oxygen_purity: safeFixed(jsonData['Schneider_PLC_OXYGEN_PURITY']),
              o2_tank: safeFixed(
                jsonData['Schneider_PLC_MF350_RESULT_O2_TANK']
              ),
              flow_meter: safeFixed(jsonData['Schneider_PLC_FLOW_METER']),
              flow_meter2: safeFixed(jsonData['Schneider_PLC_FLOWMETER2']),
              total_flow: safeFixed(jsonData['Schneider_PLC_TOTAL_FLOW']),
              running_time: safeFixed(
                jsonData['Schneider_PLC_MF510_RUNING_TIME']
              ),
              nama_dinas,
              created_at: moment().format(),
            }
          : (() => {
              const extracted = extractSensorValues(jsonData as Topic2Data);
              return {
                id_mesin,
                waktu_mesin: moment().format(),
                oxygen_purity: safeFixed(extracted.purity),
                o2_tank: safeFixed(extracted.o2Tank),
                flow_meter: null,
                flow_meter2: null,
                total_flow: safeFixed(extracted.totalFlow),
                running_time: safeFixed(extracted.runHour),
                nama_dinas,
                created_at: moment().format(),
              };
            })();

        // Simpan data hanya satu per menit per topic
        this.buffers.set(topic, { minute: currentMinute, data });
      } catch (err) {
        console.error(
          `❌ Error processing MQTT message from topic ${topic}:`,
          err
        );
      }
    });

    this.mqttClient.on('error', (err: Error) => {
      console.error('❌ MQTT Error:', err.message);
    });
  }

  private async flushAllBuffers() {
    if (this.buffers.size === 0) return;

    const entries = Array.from(this.buffers.entries());
    this.buffers.clear();

    const dataToInsert = entries.map(([_, { data }]) => data);

    try {
      const chunks = chunk(dataToInsert, CHUNK_SIZE);
      for (const ch of chunks) {
        await db('mqtt_datas').insert(ch);
      }
      console.log(`✅ Inserted ${dataToInsert.length} rows`);
    } catch (err) {
      console.error('❌ Failed to insert buffered data:', err);
    }
  }
}

export = MqttHandler;
