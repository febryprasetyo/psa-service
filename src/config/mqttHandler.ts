import * as Mqtt from 'mqtt';
import { db, moment } from '../utils/util';
import 'dotenv/config';
import { extractSensorValues } from '../utils/mqttData';
import { Topic1Data, Topic2Data } from '../types/types';

const brokerUrl = process.env.MQTT_BROKER_URL;
const options = {
  port: parseInt(process.env.MQTT_PORT || '1883'),
  keepalive: parseInt(process.env.MQTT_KEEP_ALIVE || '60'),
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

interface TopicMapping {
  topic1: string;
  topic2: string;
}

class MqttHandler {
  public mqttClient: any;
  public mqttTopics: TopicMapping[] = [];

  async getAllTopics(
    role_id: string,
    user_id?: number
  ): Promise<TopicMapping[]> {
    try {
      let rows: any[] = [];

      if (role_id === 'adm') {
        rows = await db('machines').select('id_mesin');
      } else {
        rows = await db('user_machines')
          .join('users', 'user_machines.user_id', 'users.id')
          .select('user_machines.id_mesin')
          .where('users.role_id', 'user')
          .andWhere('users.is_active', true)
          .andWhere('users.id', user_id);
      }

      return rows.map((row) => ({
        topic1: `data/psa/mgm/${row.id_mesin}`,
        topic2: row.id_mesin,
      }));
    } catch (error) {
      console.error('❌ Error getAllTopics:', error);
      return [];
    }
  }

  async connect() {
    const role_id = process.env.USER_ROLE_ID || 'adm';
    const user_id = process.env.USER_ID
      ? parseInt(process.env.USER_ID)
      : undefined;

    this.mqttTopics = await this.getAllTopics(role_id, user_id);

    if (!this.mqttTopics.length) {
      console.warn('⚠️ No topics to subscribe.');
      return;
    }

    if (!brokerUrl) {
      throw new Error(
        'MQTT_BROKER_URL is not defined in the environment variables'
      );
    }

    this.mqttClient = Mqtt.connect(brokerUrl, options);

    this.mqttClient.on('connect', () => {
      console.log('✅ MQTT connected');

      this.mqttTopics.forEach(({ topic1, topic2 }) => {
        [topic1, topic2].forEach((topic) => {
          this.mqttClient.subscribe(topic, (err: Error | null) => {
            if (err) {
              console.error(`❌ Failed to subscribe to ${topic}`, err);
            } else {
              console.log(`✅ Subscribed to ${topic}`);
            }
          });
        });
      });
    });

    this.mqttClient.on('message', async (topic: string, message: Buffer) => {
      console.log(`📩 [${topic}] ${message.toString()}`);
      const payload = message.toString();
      let trx;

      try {
        trx = await db.transaction();
        const jsonData = JSON.parse(payload);
        const id_mesin = topic.includes('/') ? topic.split('/').pop() : topic;

        if (topic.startsWith('data/psa/mgm/')) {
          // ➕ TOPIC 1
          const waktu_mesin = jsonData['_terminalTime'] || moment().format();
          const group_name = jsonData['_groupName'] || topic;

          const mesinInfo = await trx('machines')
            .select('nama_dinas')
            .where('id_mesin', id_mesin)
            .first();
          const nama_dinas = mesinInfo?.nama_dinas || null;

          const dataToInsert = {
            id_mesin,
            waktu_mesin,
            oxygen_purity:
              jsonData['Schneider_PLC_OXYGEN_PURITY'].toFixed(2) || null,
            o2_tank:
              jsonData['Schneider_PLC_MF350_RESULT_O2_TANK'].toFixed(2) || null,
            flow_meter: jsonData['Schneider_PLC_FLOW_METER'].toFixed(2) || null,
            flow_meter2:
              jsonData['Schneider_PLC_FLOWMETER2'].toFixed(2) || null,
            total_flow: jsonData['Schneider_PLC_TOTAL_FLOW'].toFixed(2) || null,
            running_time:
              jsonData['Schneider_PLC_MF510_RUNING_TIME'].toFixed(2) || null,
            nama_dinas,
            created_at: moment().format(),
          };

          await trx('mqtt_datas').insert(dataToInsert);
          console.log(`✅ Inserted Topic 1 data for ${id_mesin}`);
        } else {
          // ➕ TOPIC 2
          const extracted = extractSensorValues(jsonData as Topic2Data);

          const mesinInfo = await trx('machines')
            .select('nama_dinas')
            .where('id_mesin', id_mesin)
            .first();
          const nama_dinas = mesinInfo?.nama_dinas || null;

          const dataToInsert = {
            id_mesin,
            waktu_mesin: moment().format(),
            oxygen_purity: extracted.purity?.toFixed(2),
            o2_tank: extracted.o2Tank?.toFixed(2),
            flow_meter: null,
            flow_meter2: null,
            total_flow: extracted.totalFlow?.toFixed(2),
            running_time: extracted.runHour?.toFixed(2),
            nama_dinas: nama_dinas,
            group_name: null,
            created_at: moment().format(),
          };

          await trx('mqtt_datas').insert(dataToInsert);
          console.log(`✅ Inserted Topic 2 data (combined) for ${id_mesin}`);
        }

        await trx.commit();
      } catch (err) {
        if (trx) await trx.rollback();
        console.error('❌ Failed to insert MQTT data:', err);
      }
    });

    this.mqttClient.on('reconnect', () => {
      console.log('🔁 Reconnecting to MQTT broker...');
    });

    this.mqttClient.on('offline', () => {
      console.warn('⚠️ MQTT client is offline');
    });

    this.mqttClient.on('close', () => {
      console.warn('🔌 MQTT connection closed');
    });

    this.mqttClient.on('error', (err: Error) => {
      console.error('❌ MQTT Error:', err.message);
    });
  }
}

export = MqttHandler;
