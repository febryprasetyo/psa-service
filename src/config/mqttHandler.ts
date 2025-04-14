import * as Mqtt from 'mqtt';
import { db, moment } from '../utils/util';
import 'dotenv/config';

var brokerUrl: any = process.env.MQTT_BROKER_URL;
var options: any = {
  port: parseInt(process.env.MQTT_PORT || '1883'),
  keepalive: parseInt(process.env.MQTT_KEEP_ALIVE || '60'),
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
};

class MqttHandler {
  public mqttClient: any;
  public mqttTopic: any;

  async getDataTopic() {
    try {
      let data = await db
        .select(db.raw(`jsonb_agg(distinct id_mesin) as id_mesin`))
        .from('users')
        .whereRaw(`role_id = ? and is_active`, ['user']);
      return data;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async connect() {
    // Get Data Topic
    this.mqttTopic = await this.getDataTopic();
    this.mqttTopic = this.mqttTopic[0].id_mesin;
    console.log(
      `------------------ Data topic : ${this.mqttTopic} ------------------`
    );
    if (!this.mqttTopic) {
      console.log('------------------ Data topic not found ------------------');
      return;
    }

    // Connect MQTT with credentials
    this.mqttClient = Mqtt.connect(brokerUrl, options);

    // Handle MQTT error callback
    this.mqttClient.on('error', (err: any) => {
      console.error('MQTT Error:', err);
      this.mqttClient.end();
    });

    // Handle connection
    this.mqttClient.on('connect', () => {
      console.log(`MQTT client connected`);

      // Subscribe to multiple topics
      this.mqttTopic.forEach((topic: any) => {
        this.mqttClient.subscribe(topic, (err: any, granted: any) => {
          if (err) {
            console.error(`Failed to subscribe to topic ${topic}:`, err);
          } else {
            console.log(`Subscribed to topic: ${topic}`);
          }
        });
      });
    });

    // Handle incoming messages
    this.mqttClient.on('message', async (topic: any, message: any) => {
      console.log('Received message');
      console.log('Topic:', topic);
      console.log('Message:', message.toString());
      let trx;
      try {
        trx = await db.transaction();
        const jsonString = JSON.parse(message.toString());
        // console.log('Parsed JSON:', jsonString);
        let val = jsonString['data'];
        console.log(
          `----------------------- Process Check Data ${topic} -----------------------`
        );
        let check = await trx
          .select(trx.raw(`*`))
          .from('mqtt_storage_data')
          .whereRaw(`id_mesin = ? and waktu_mesin = ?`, [
            topic,
            jsonString['time'],
          ]);

        if (check.length === 0) {
          console.log(
            `----------------------- Process Insert Data ${topic} -----------------------`
          );
          await trx('mqtt_storage_data').insert({
            id_mesin: topic || '-',
            waktu_mesin: jsonString['time'],
            cold_storage_fan_overload: val['#Cold storage fan overload'],
            cold_storage_high_t_alarm: val['#Cold storage high T alarm'],
            cold_storage_low_t_alarm: val['#Cold storage low T alarm'],
            compressor_overload: val['#Compressor overload'],
            door_open_alarm: val['#Door open alarm'],
            emergency_stop_protection: val['#Emergency stop protection'],
            feedback_signal_b_protection: val['#Feedback signal B protection'],
            high_t_timeout_alarm: val['#High T timeout alarm'],
            high_and_low_voltage_switch: val['#High and low voltage switch'],
            integrated_power_protection: val['#Integrated power protection'],
            low_t_timeout_alarm: val['#Low T timeout alarm'],
            module_protection: val['#Module protection'],
            oil_pressure_differential: val['#Oil pressure differential'],
            overload_of_condensing_fan: val['#Overload of condensing fan'],
            analog_detection_cycle: val['Analog detection cycle'],
            clear_all_occurrences: val['Clear all occurrences'],
            clear_production_records: val['Clear production records'],
            clear_todays_frequency: val["Clear today's frequency"],
            cold_storage_t1_correction: val['Cold storage T 1 correction'],
            cold_storage_t2_correction: val['Cold storage T 2 correction'],
            cold_storage_high_t_alarm_threshold:
              val['Cold storage high T alarm'],
            cold_storage_low_t_alarm_threshold: val['Cold storage low T alarm'],
            cold_storage_temperature_1: val['Cold storage temperature 1'],
            cold_storage_temperature_2: val['Cold storage temperature 2'],
            compressor_status: val['Compressor status'],
            condensation_stop_delay: val['Condensation stop delay'],
            cooling_start_up_temperature: val['Cooling start-up temperature'],
            cooling_stop_temperature: val['Cooling stop temperature'],
            defrosting_heating_time: val['Defrosting heating time'],
            defrosting_temperature: val['Defrosting temperature'],
            end_temperature_of_defrosting: val['End temperature of defrosting'],
            equipment_situation: val['Equipment situation'],
            fan_cycle_on_time: val['Fan cycle on time'],
            fan_cycle_shutdown_time: val['Fan cycle shutdown time'],
            fault_detection_delay: val['Fault detection delay'],
            frost_and_water_dripping_time: val['Frost and water dripping time'],
            frost_interval_time: val['Frost interval time'],
            frost_temperature_correction: val['Frost temperature correction'],
            hydraulic_valve: val['Hydraulic valve'],
            manual_defrosting: val['Manual defrosting'],
            number_of_door_openings_today: val['Number of door openings today'],
            press: val['Press'],
            press_running_time_h: val['Press running time H'],
            press_running_time_m: val['Press running time M'],
            record_production_volume: val['Record production volume'],
            shutdown_protection_time: val['Shutdown protection time'],
            starting_system: val['Starting system'],
            stop_system: val['Stop System'],
            todays_output: val["Today's output"],
            total_number_of_door_openings: val['Total number of door openings'],
            unit_power_on_delay: val['Unit power on delay'],
            warehouse_t_timeout_alarm: val['Warehouse T timeout alarm'],
            alarm_silence: val['alarm silence'],
            average_temperature: val['average temperature'],
            condensing_fan: val['condensing fan'],
            door_open_alarm_delay: val['door open alarm delay'],
            drip: val['drip'],
            fan: val['fan'],
            fan_delay_the_start_time: val['fan Delay the start time'],
            fan_delayed_shutdown_time: val['fan Delayed shutdown time'],
            fault_reset: val['fault reset'],
            production: val['production'],
            shutdown_protection_time_dup: val['shutdown protection time'],
            total_output: val['total output'],
          });
        }
        console.log(
          `----------------------- Finish Insert Data ${topic} -----------------------`
        );

        await trx.commit();
      } catch (err) {
        if (trx) trx.rollback();
        console.error('Failed to parse message:', err);
      }
    });

    // Handle MQTT client close
    this.mqttClient.on('close', () => {
      console.log(`MQTT client disconnected`);
    });
  }
}

export = MqttHandler;
