import {
  logger,
  sendResponseCustom,
  sendResponseError,
  errorCodes,
  createError,
  validateParamsAll,
  db,
  moment,
} from '../utils/util';
import bcrypt from 'bcrypt';
import MqttHandler from '../config/mqttHandler';
import * as ExcelJS from 'exceljs';

class MqttController {
  /**
   * API Handle Create User
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-14
   */
  async handleCreateUser(req: any, res: any) {
    let trx;
    try {
      let reqBody = req.body;

      let rules = {
        username: 'required',
        password: 'required',
        id_mesin: 'required',
      };

      // Validate the request params
      await validateParamsAll(reqBody, rules).catch((err) => {
        delete err.failed;
        throw createError('', 'E_BAD_REQUEST', err);
      });
      let checkIdMesin = await db
        .select(db.raw(`jsonb_agg(distinct id_mesin) as id_mesin`))
        .from('users')
        .whereRaw(`role_id = ? and is_active`, ['user']);

      let isReconnect = false;
      if (checkIdMesin.length > 0) {
        let idMesin = checkIdMesin[0].id_mesin;
        if (idMesin) {
          let ctx = idMesin.filter(
            (item: any) => item === reqBody.id_mesin.trim()
          );
          if (ctx.length === 0) {
            isReconnect = true;
          }
        } else {
          isReconnect = true;
        }
      }

      trx = await db.transaction();
      let data = await trx
        .select(trx.raw(`*`))
        .from('users')
        .whereRaw(`username = ?`, reqBody.username.trim());
      if (data.length > 0)
        throw createError(
          `User ${reqBody.username} already exists`,
          'E_BAD_REQUEST'
        );

      const salt = await bcrypt.genSalt(10);
      reqBody.password = await bcrypt.hash(reqBody.password.trim(), salt);

      await trx('users').insert({
        username: reqBody.username.trim(),
        fullname: reqBody.fullname.trim(),
        email: reqBody.email.trim(),
        password: reqBody.password,
        id_mesin: reqBody.id_mesin.trim(),
        province: reqBody.province.trim(),
        city: reqBody.city.trim(),
        role_id: 'user',
        is_active: true,
      });

      await trx.commit();

      if (isReconnect) {
        //Reconnect Mqtt
        var mqttClient = new MqttHandler();
        mqttClient.connect();
      }
      return sendResponseCustom(res, {
        success: true,
        message: 'Data berhasil disimpan',
      });
    } catch (error: any) {
      if (trx) trx.rollback();
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }

  /**
   * API Handle Update User
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-14
   */
  async handleUpdateUser(req: any, res: any) {
    try {
      let reqBody = req.body;

      let rules = {
        id: 'required|number',
        is_active: 'required',
        fullname: 'required',
        id_mesin: 'required',
      };

      // Validate the request params
      await validateParamsAll(reqBody, rules).catch((err) => {
        delete err.failed;
        throw createError('', 'E_BAD_REQUEST', err);
      });

      let data = await db
        .select(db.raw(`*`))
        .from('users')
        .whereRaw(`id = ?`, reqBody.id);
      if (data.length === 0)
        throw createError(`User not found`, 'E_BAD_REQUEST');
      data = data[0];

      let checkIdMesin = await db
        .select(db.raw(`jsonb_agg(distinct id_mesin) as id_mesin`))
        .from('users')
        .whereRaw(`role_id = ? and is_active`, ['user']);

      let isReconnect = false;
      if (checkIdMesin.length > 0) {
        let idMesin = checkIdMesin[0].id_mesin;
        if (idMesin) {
          let ctx = idMesin.filter(
            (item: any) => item === reqBody.id_mesin.trim()
          );
          if (ctx.length === 0) {
            isReconnect = true;
          }
        } else {
          isReconnect = true;
        }
      }

      let match;
      if (reqBody.password) {
        match = await bcrypt.compare(reqBody.password, data.password);

        if (!match) {
          const salt = await bcrypt.genSalt(10);
          reqBody.password = await bcrypt.hash(reqBody.password.trim(), salt);
        }
      }
      await db('users')
        .whereRaw(`id = ?`, reqBody.id)
        .update({
          fullname: reqBody.fullname.trim(),
          password: match ? undefined : reqBody.password,
          id_mesin: reqBody.id_mesin,
          device_id: reqBody.id_mesin.trim(),
          updated_at: new Date(),
        });

      if (isReconnect) {
        //Reconnect Mqtt
        var mqttClient = new MqttHandler();
        mqttClient.connect();
      }

      return sendResponseCustom(res, {
        success: true,
        message: 'Data berhasil diubah',
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }

  /**
   * API Handle Remove User
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-14
   */
  async handleRemoveUser(req: any, res: any) {
    try {
      let reqBody = req.body;

      let rules = {
        id: 'required|number',
      };

      // Validate the request params
      await validateParamsAll(reqBody, rules).catch((err) => {
        delete err.failed;
        throw createError('', 'E_BAD_REQUEST', err);
      });

      let checkUser = await db
        .select(db.raw(`*`))
        .from('users')
        .whereRaw(`id = ?`, [reqBody.id]);
      if (checkUser.length === 0)
        throw createError(`Data user not found`, 'E_BAD_REQUEST');

      await db('users').where('id', reqBody.id).del();

      //Reconnect Mqtt
      var mqttClient = new MqttHandler();
      mqttClient.connect();

      return sendResponseCustom(res, {
        success: true,
        message: 'Data berhasil dihapus',
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }

  /**
   * API Handle Remove Device
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-14
   */
  async handleListUser(req: any, res: any) {
    try {
      let reqBody = req.body;

      let rules = {
        limit: 'required',
        offset: 'required',
      };

      // Validate the request params
      await validateParamsAll(reqBody, rules).catch((err) => {
        delete err.failed;
        throw createError('', 'E_BAD_REQUEST', err);
      });

      let dataUser = await db
        .select(
          db.raw(
            `usr.id, usr.username, usr.id_mesin, usr.fullname, usr.is_active, usr.role_id`
          )
        )
        .from('users AS usr')
        .orderBy('usr.created_at', 'DESC')
        .limit(reqBody.limit, { skipBinding: true })
        .offset(reqBody.offset);

      let query = db
        .select(
          db.raw(`
          usr.id, usr.username, usr.id_mesin, usr.fullname, usr.is_active, usr.role_id, usr.province, usr.city 
        `)
        )
        .from('users AS usr');

      let queryData = db.select(db.raw(`COUNT(*) as total`)).from('users');
      let countDataUser = await db
        .select(db.raw(`COUNT(*) as total`))
        .from('users');

      if (req.body.role_id !== 'adm') {
        query = query.whereRaw(`usr.id = ?`, req.body.user_id);

        queryData = queryData.whereRaw(`usr.id = ?`, req.body.user_id);
      }
      let data = await query
        .orderBy('usr.created_at', 'DESC')
        .limit(reqBody.limit, { skipBinding: true })
        .offset(reqBody.offset);

      let countData = await countDataUser;

      return sendResponseCustom(res, {
        success: true,
        data: {
          values: data,
          total: countData.length == 0 ? 0 : countData[0].total,
          limit: reqBody.limit,
          offset: reqBody.offset,
        },
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }

  async handleMqttList(req: any, res: any) {
    try {
      let limit = req.query.limit ? req.query.limit : 100;
      let offset = req.query.offset ? req.query.offset : 0;
      let startDate = req.query.startDate
        ? moment(req.query.startDate).format('YYYY-MM-DD')
        : null;
      let endDate = req.query.endDate
        ? moment(req.query.endDate).format('YYYY-MM-DD')
        : null;

      let query = db
        .select(
          db.raw(`
        ROW_NUMBER() OVER (ORDER BY md.created_at DESC) AS number, md.*`)
        )
        .from('mqtt_storage_data AS md')
        .orderByRaw(`md.created_at DESC`)
        .limit(parseInt(limit), { skipBinding: true })
        .offset(
          parseInt(offset) === 0
            ? parseInt(offset)
            : parseInt(limit) * parseInt(offset)
        );

      let qt = db.select(db.raw(`count(md.*)`)).from('mqtt_storage_data AS md');

      if (startDate && endDate) {
        query = query.whereRaw(
          `to_char(created_at, 'YYYY-MM-DD') BETWEEN ? AND ?`,
          [startDate, endDate]
        );
        qt = qt.whereRaw(`to_char(created_at, 'YYYY-MM-DD') BETWEEN ? AND ?`, [
          startDate,
          endDate,
        ]);
      }

      if (req.body.role_id == 'user') {
        let user = await db
          .select(db.raw(`id_mesin`))
          .from('users')
          .whereRaw(`id = ?`, [req.body.user_id]);
        if (user.length == 0) {
          throw createError(`Data user not found`, 'E_BAD_REQUEST');
        }
        user = user[0];
        if (!user.id_mesin) {
          throw createError(`Data id_mesin user not found`, 'E_BAD_REQUEST');
        }
        query = query.whereRaw(`id_mesin = ?`, [user.id_mesin]);
        qt = qt.whereRaw(`id_mesin = ?`, [user.id_mesin]);
      }

      let data = await query;
      let totalData = await qt;

      return sendResponseCustom(res, {
        success: true,
        totalData: totalData[0].count,
        limit,
        offset,
        data,
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }

  async handleMqttDashboard(req: any, res: any) {
    try {
      let idMesin = req.query.idMesin;

      let query = db
        .select(db.raw(`md.*`))
        .from('mqtt_storage_data AS md')
        .orderByRaw(`md.created_at DESC`)
        .limit(1)
        .first();

      if (idMesin) {
        query = query.whereRaw(`md.id_mesin = ?`, [idMesin]);
      }

      let data = await query;

      return sendResponseCustom(res, {
        success: true,
        data,
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }

  async handleMqttExport(req: any, res: any) {
    try {
      let startDate = req.query.startDate
        ? moment(req.query.startDate).format('YYYY-MM-DD')
        : null;
      let endDate = req.query.endDate
        ? moment(req.query.endDate).format('YYYY-MM-DD')
        : null;

      let query = db
        .select(db.raw(`md.*`))
        .from('mqtt_storage_data AS md')
        .orderByRaw(`md.created_at DESC`);

      if (startDate && endDate) {
        query = query.whereRaw(
          `to_char(created_at, 'YYYY-MM-DD') BETWEEN ? AND ?`,
          [startDate, endDate]
        );
      }

      if (req.body.role_id == 'user') {
        let user = await db
          .select(db.raw(`id_mesin`))
          .from('users')
          .whereRaw(`id = ?`, [req.body.user_id]);
        if (user.length == 0) {
          throw createError(`Data user not found`, 'E_BAD_REQUEST');
        }
        user = user[0];
        if (!user.id_mesin) {
          throw createError(`Data id_mesin user not found`, 'E_BAD_REQUEST');
        }
        query = query.whereRaw(`id_mesin = ?`, [user.id_mesin]);
      }

      let data = await query;

      data.forEach((item: any, idx: any) => {
        item.number = idx + 1;
      });

      // Create a new workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data');

      const headers = [
        { header: 'no', key: 'number' },
        { header: 'id_mesin', key: 'id_mesin' },
        { header: 'time', key: 'time' },
        // { header : 'cold_storage_fan_overload', key : 'cold_storage_fan_overload'},
        // { header : 'cold_storage_high_t_alarm', key : 'cold_storage_high_t_alarm'},
        // { header : 'cold_storage_low_t_alarm', key : 'cold_storage_low_t_alarm'},
        // { header : 'compressor_overload', key : 'compressor_overload'},
        // { header : 'door_open_alarm', key : 'door_open_alarm'},
        // { header : 'emergency_stop_protection', key : 'emergency_stop_protection'},
        // { header : 'feedback_signal_b_protection', key : 'feedback_signal_b_protection'},
        // { header : 'high_t_timeout_alarm', key : 'high_t_timeout_alarm'},
        // { header : 'high_and_low_voltage_switch', key : 'high_and_low_voltage_switch'},
        // { header : 'integrated_power_protection', key : 'integrated_power_protection'},
        // { header : 'low_t_timeout_alarm', key : 'low_t_timeout_alarm'},
        // { header : 'module_protection', key : 'module_protection'},
        // { header : 'oil_pressure_differential', key : 'oil_pressure_differential'},
        // { header : 'overload_of_condensing_fan', key : 'overload_of_condensing_fan'},
        // { header : 'analog_detection_cycle', key : 'analog_detection_cycle'},
        // { header : 'clear_all_occurrences', key : 'clear_all_occurrences'},
        // { header : 'clear_production_records', key : 'clear_production_records'},
        // { header : 'clear_todays_frequency', key : 'clear_todays_frequency'},
        // { header : 'cold_storage_t1_correction', key : 'cold_storage_t1_correction'},
        // { header : 'cold_storage_t2_correction', key : 'cold_storage_t2_correction'},
        // { header : 'cold_storage_high_t_alarm_threshold', key : 'cold_storage_high_t_alarm_threshold'},
        // { header : 'cold_storage_low_t_alarm_threshold', key : 'cold_storage_low_t_alarm_threshold'},
        {
          header: 'cold_storage_temperature_1',
          key: 'cold_storage_temperature_1',
        },
        {
          header: 'cold_storage_temperature_2',
          key: 'cold_storage_temperature_2',
        },
        { header: 'average_temperature', key: 'average_temperature' },
        { header: 'defrosting_temperature', key: 'defrosting_temperature' },
        {
          header: 'number_of_door_openings_today',
          key: 'number_of_door_openings_today',
        },
        {
          header: 'total_number_of_door_openings',
          key: 'total_number_of_door_openings',
        },
        { header: 'todays_output', key: 'todays_output' },
        { header: 'total_output', key: 'total_output' },
        // { header : 'compressor_status', key : 'compressor_status'},
        // { header : 'condensation_stop_delay', key : 'condensation_stop_delay'},
        // { header : 'cooling_start_up_temperature', key : 'cooling_start_up_temperature'},
        // { header : 'cooling_stop_temperature', key : 'cooling_stop_temperature'},
        // { header : 'defrosting_heating_time', key : 'defrosting_heating_time'},
        // { header : 'end_temperature_of_defrosting', key : 'end_temperature_of_defrosting'},
        // { header : 'equipment_situation', key : 'equipment_situation'},
        // { header : 'fan_cycle_on_time', key : 'fan_cycle_on_time'},
        // { header : 'fan_cycle_shutdown_time', key : 'fan_cycle_shutdown_time'},
        // { header : 'fault_detection_delay', key : 'fault_detection_delay'},
        // { header : 'frost_and_water_dripping_time', key : 'frost_and_water_dripping_time'},
        // { header : 'frost_interval_time', key : 'frost_interval_time'},
        // { header : 'frost_temperature_correction', key : 'frost_temperature_correction'},
        // { header : 'hydraulic_valve', key : 'hydraulic_valve'},
        // { header : 'manual_defrosting', key : 'manual_defrosting'},
        // { header : 'press', key : 'press'},
        // { header : 'press_running_time_h', key : 'press_running_time_h'},
        // { header : 'press_running_time_m', key : 'press_running_time_m'},
        // { header : 'record_production_volume', key : 'record_production_volume'},
        // { header : 'shutdown_protection_time', key : 'shutdown_protection_time'},
        // { header : 'starting_system', key : 'starting_system'},
        // { header : 'stop_system', key : 'stop_system'},
        // { header : 'unit_power_on_delay', key : 'unit_power_on_delay'},
        // { header : 'warehouse_t_timeout_alarm', key : 'warehouse_t_timeout_alarm'},
        // { header : 'alarm_silence', key : 'alarm_silence'},
        // { header : 'condensing_fan', key : 'condensing_fan'},
        // { header : 'door_open_alarm_delay', key : 'door_open_alarm_delay'},
        // { header : 'drip', key : 'drip'},
        // { header : 'fan', key : 'fan'},
        // { header : 'fan_delay_the_start_time', key : 'fan_delay_the_start_time'},
        // { header : 'fan_delayed_shutdown_time', key : 'fan_delayed_shutdown_time'},
        // { header : 'fault_reset', key : 'fault_reset'},
        // { header : 'production', key : 'production'},
        // { header : 'shutdown_protection_time_dup', key : 'shutdown_protection_time_dup'},
      ];

      sheet.columns = headers;

      // Add custom headers to the worksheet
      headers.forEach((header) => {
        const column = sheet.getColumn(header.key);
        column.header = header.header;
        column.eachCell((cell) => {
          // Example of setting cell style (modify as needed)
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '95B3D7' },
          };
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        });
      });

      data.forEach((item: any) => {
        const row = {
          number: item.number,
          id_mesin: item.id_mesin,
          time: item.waktu_mesin,
          cold_storage_fan_overload: item.cold_storage_fan_overload,
          cold_storage_high_t_alarm: item.cold_storage_high_t_alarm,
          cold_storage_low_t_alarm: item.cold_storage_low_t_alarm,
          compressor_overload: item.compressor_overload,
          door_open_alarm: item.door_open_alarm,
          emergency_stop_protection: item.emergency_stop_protection,
          feedback_signal_b_protection: item.feedback_signal_b_protection,
          high_t_timeout_alarm: item.high_t_timeout_alarm,
          high_and_low_voltage_switch: item.high_and_low_voltage_switch,
          integrated_power_protection: item.integrated_power_protection,
          low_t_timeout_alarm: item.low_t_timeout_alarm,
          module_protection: item.module_protection,
          oil_pressure_differential: item.oil_pressure_differential,
          overload_of_condensing_fan: item.overload_of_condensing_fan,
          analog_detection_cycle: item.analog_detection_cycle,
          clear_all_occurrences: item.clear_all_occurrences,
          clear_production_records: item.clear_production_records,
          clear_todays_frequency: item.clear_todays_frequency,
          cold_storage_t1_correction: item.cold_storage_t1_correction,
          cold_storage_t2_correction: item.cold_storage_t2_correction,
          cold_storage_high_t_alarm_threshold:
            item.cold_storage_high_t_alarm_threshold,
          cold_storage_low_t_alarm_threshold:
            item.cold_storage_low_t_alarm_threshold,
          cold_storage_temperature_1: item.cold_storage_temperature_1,
          cold_storage_temperature_2: item.cold_storage_temperature_2,
          compressor_status: item.compressor_status,
          condensation_stop_delay: item.condensation_stop_delay,
          cooling_start_up_temperature: item.cooling_start_up_temperature,
          cooling_stop_temperature: item.cooling_stop_temperature,
          defrosting_heating_time: item.defrosting_heating_time,
          defrosting_temperature: item.defrosting_temperature,
          end_temperature_of_defrosting: item.end_temperature_of_defrosting,
          equipment_situation: item.equipment_situation,
          fan_cycle_on_time: item.fan_cycle_on_time,
          fan_cycle_shutdown_time: item.fan_cycle_shutdown_time,
          fault_detection_delay: item.fault_detection_delay,
          frost_and_water_dripping_time: item.frost_and_water_dripping_time,
          frost_interval_time: item.frost_interval_time,
          frost_temperature_correction: item.frost_temperature_correction,
          hydraulic_valve: item.hydraulic_valve,
          manual_defrosting: item.manual_defrosting,
          number_of_door_openings_today: item.number_of_door_openings_today,
          press: item.press,
          press_running_time_h: item.press_running_time_h,
          press_running_time_m: item.press_running_time_m,
          record_production_volume: item.record_production_volume,
          shutdown_protection_time: item.shutdown_protection_time,
          starting_system: item.starting_system,
          stop_system: item.stop_system,
          todays_output: item.todays_output,
          total_number_of_door_openings: item.total_number_of_door_openings,
          unit_power_on_delay: item.unit_power_on_delay,
          warehouse_t_timeout_alarm: item.warehouse_t_timeout_alarm,
          alarm_silence: item.alarm_silence,
          average_temperature: item.average_temperature,
          condensing_fan: item.condensing_fan,
          door_open_alarm_delay: item.door_open_alarm_delay,
          drip: item.drip,
          fan: item.fan,
          fan_delay_the_start_time: item.fan_delay_the_start_time,
          fan_delayed_shutdown_time: item.fan_delayed_shutdown_time,
          fault_reset: item.fault_reset,
          production: item.production,
          shutdown_protection_time_dup: item.shutdown_protection_time_dup,
          total_output: item.total_output,
        };
        sheet.addRow(row);
      });

      /* generate buffer */
      const excelBuffer = await workbook.xlsx.writeBuffer();

      res.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const filename = `mqtt_reporting_${moment().format(
        'YYYYMMDDHHmmsss'
      )}.xlsx`;
      res.header('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(excelBuffer);
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      return sendResponseError(res, error);
    }
  }
}

export = MqttController;
