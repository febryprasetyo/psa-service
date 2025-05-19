import { Request, Response } from 'express';
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
import { create } from 'lodash';
import { Knex } from 'knex';

class MqttController {
  /**
   * API Handle Create User
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-14
   */

  async handleCreateUser(req: Request, res: Response) {
    let trx;
    try {
      const { username, password, nama_dinas, alamat } =
        req.body as unknown as {
          username: string;
          password: string;
          nama_dinas: string;
          alamat: string;
        };

      await validateParamsAll(req.body, {
        username: 'required',
        password: 'required',
        nama_dinas: 'required',
        alamat: 'required',
      });

      trx = await db.transaction();

      const isExist = await trx('users').where({ username }).first();
      if (isExist)
        throw createError('Username sudah terdaftar', 'E_BAD_REQUEST');

      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      await trx('users').insert({
        username,
        password: hash,
        role_id: 'user',
        is_active: true,
        alamat,
        nama_dinas,
        created_at: new Date(),
      });

      await trx.commit();
      return sendResponseCustom(res, {
        success: true,
        message: 'User berhasil dibuat',
      });
    } catch (err: any) {
      if (trx) await trx.rollback();
      return sendResponseError(res, err);
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
          password: match ? undefined : reqBody.password,
          username: reqBody.username.trim(),
          alamat: reqBody.alamat.trim(),
          nama_dinas: reqBody.nama_dinas.trim(),
          updated_at: new Date(),
        });

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
            `usr.id, usr.username, usr.alamat, usr.nama_dinas, usr.is_active, usr.role_id`
          )
        )
        .from('users AS usr')
        .orderBy('usr.created_at', 'DESC')
        .limit(reqBody.limit, { skipBinding: true })
        .offset(reqBody.offset);

      let query = db
        .select(
          db.raw(`
          usr.id, usr.username, usr.alamat, usr.nama_dinas, usr.is_active, usr.role_id
        `)
        )
        .from('users AS usr');

      let queryData = db.select(db.raw(`COUNT(*) as total`)).from('users');
      let countDataUser = await db
        .select(db.raw(`COUNT(*) as total`))
        .from('users');

      if (reqBody.role_id !== 'adm') {
        // Non-admin hanya bisa melihat dirinya sendiri
        return sendResponseCustom(res, {
          success: false,
          message: 'Access API denied!',
        });
      } else {
        // Admin tidak bisa melihat user admin lainnya
        query.whereNot('usr.role_id', 'adm');
        queryData.whereNot('usr.role_id', 'adm');
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

  /**
   * API Handle Create Machine
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-23
   */
  async handleCreateMachine(req: any, res: any) {
    try {
      const { id_mesin, dinas_id } = req.body;

      if (!id_mesin || !dinas_id) {
        return sendResponseCustom(res, {
          success: false,
          message: 'id_mesin dan dinas_id wajib diisi!',
        });
      }

      // 1. Ambil data user untuk nama_dinas & alamat
      const user = await db('users')
        .select('nama_dinas', 'alamat')
        .where('id', dinas_id)
        .first();

      if (!user) {
        return sendResponseCustom(res, {
          success: false,
          message: 'User dengan dinas_id tersebut tidak ditemukan!',
        });
      }

      // 2. Insert ke tabel machines
      const now = new Date();
      const machineData = {
        id_mesin,
        nama_dinas: user.nama_dinas,
        alamat: user.alamat,
        dinas_id,
        created_at: now,
        updated_at: now,
      };

      await db('machines').insert(machineData);

      // 3. Insert ke tabel user_machine
      await db('user_machines').insert({
        dinas_id: dinas_id,
        id_mesin: id_mesin, // id dari tabel machines
        created_at: now,
        updated_at: now,
      });

      return sendResponseCustom(res, {
        success: true,
        message: 'Data mesin berhasil ditambahkan.',
        data: machineData,
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);
      return sendResponseError(res, error);
    }
  }

  /**
   * API Handle Remove Machine
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-23
   */
  async handleRemoveMachine(req: Request, res: Response) {
    let trx;
    try {
      const { id_mesin } = req.body as { id_mesin: string };
      await validateParamsAll(req.body, {
        id_mesin: 'required',
      });

      trx = await db.transaction();

      // Validasi: Cek apakah id_mesin ada di tabel machines
      const machineExists = await trx('machines').where({ id_mesin }).first();

      if (!machineExists) {
        return sendResponseCustom(res, {
          success: false,
          message: 'Mesin dengan id_mesin tersebut tidak ditemukan',
        });
      }

      // Hapus dari user_machines
      const deletedUserMachines = await trx('user_machines')
        .where({ id_mesin })
        .del();
      console.log(`Deleted from user_machines: ${deletedUserMachines} rows`);

      // Hapus dari machines
      const deletedMachines = await trx('machines').where({ id_mesin }).del();
      console.log(`Deleted from machines: ${deletedMachines} rows`);

      if (deletedMachines === 0) {
        throw new Error('Data mesin gagal dihapus');
      }

      await trx.commit();
      return sendResponseCustom(res, {
        success: true,
        message: 'Mesin berhasil dihapus',
      });
    } catch (err: any) {
      if (trx) await trx.rollback();
      console.error('Error:', err);
      return sendResponseError(res, err);
    }
  }

  /**
   * API Handle List Machine
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-23
   */
  async handleListMachine(req: Request, res: Response) {
    try {
      // Ambil dari query dan convert ke number
      const limit = Number(req.query.limit) || 10;
      const offsetParam = Number(req.query.offset) || 0;

      if (isNaN(limit) || isNaN(offsetParam)) {
        return sendResponseCustom(res, {
          success: false,
          message: 'Parameter limit dan offset harus berupa angka.',
        });
      }

      const offset = offsetParam === 0 ? 0 : limit * offsetParam;

      // Query data mesin
      const data = await db
        .select('m.id', 'm.id_mesin', 'm.nama_dinas', 'm.alamat')
        .from('machines AS m')
        .orderBy('m.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      // Query total data
      const countData = await db('machines').count('* as count').first();

      return sendResponseCustom(res, {
        success: true,
        data: {
          values: data,
          total: countData?.count ? Number(countData.count) : 0,
          limit,
          offset: offsetParam, // balikin offset dalam bentuk page (bukan offset hasil kalkulasi)
        },
      });
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);
      return sendResponseError(res, error);
    }
  }

  async handleMqttList(req: any, res: any) {
    try {
      let startDate = req.query.startDate
        ? moment(req.query.startDate).format('YYYY-MM-DD')
        : null;
      let endDate = req.query.endDate
        ? moment(req.query.endDate).format('YYYY-MM-DD')
        : null;

      // Mulai query utama
      let query = db('mqtt_datas as data').select(
        'id_mesin',
        'waktu_mesin',
        'oxygen_purity',
        'o2_tank',
        'flow_meter',
        'flow_meter2',
        'total_flow',
        'running_time',
        'created_at',
        'nama_dinas'
      );

      if (startDate && endDate) {
        query = query.whereRaw(
          `to_char(created_at, 'YYYY-MM-DD') BETWEEN ? AND ?`,
          [startDate, endDate]
        );
      }
      let reqBody = req.body;
      const {
        role_id,
        user_id,
        id_mesin,
        namaDinas,
        sort = 'desc',
        limit = 10,
        offset = 0,
      } = req.query;

      // Validasi input dasar
      await validateParamsAll(req.query, {
        limit: 'required',
        offset: 'required',
      });

      // Jika role user, tampilkan hanya data dari mesin yang dimiliki
      if (reqBody.role_id === 'usr') {
        query = query
          .join('machines as mcs', 'data.id_mesin', 'mcs.id_mesin')
          .where('mcs.dinas_id', user_id);
      }

      // Filter: tanggal mulai
      if (startDate) {
        query = query.where('created_at', '>=', startDate);
      }

      // Filter: tanggal akhir
      if (endDate) {
        query = query.where('created_at', '<=', endDate);
      }

      // Filter: id_mesin
      if (namaDinas) {
        query = query.where('nama_dinas', namaDinas);
      }

      // Sorting ASC / DESC
      query = query.orderBy('created_at', sort === 'asc' ? 'asc' : 'desc');

      // Pagination
      query = query.limit(limit).offset(offset);

      // Eksekusi query
      const data = await query;

      // Hitung total data (tanpa limit & offset)
      const totalQuery = db('mqtt_datas as data');

      if (reqBody.role_id === 'usr') {
        totalQuery
          .join('machines as mcs', 'id_mesin', 'mcs.id_mesin')
          .where('mcs.dinas_id', user_id);
      }

      if (startDate) totalQuery.where('data.created_at', '>=', startDate);
      if (endDate) totalQuery.where('data.created_at', '<=', endDate);
      if (id_mesin) totalQuery.where('data.id_mesin', id_mesin);

      const totalCountResult = await totalQuery
        .count('data.id as count')
        .first();

      const totalResult = totalCountResult as { count: string };
      const total = parseInt(totalResult?.count || '0', 10);

      // Response
      return sendResponseCustom(res, {
        success: true,
        total,
        limit,
        offset,
        data: {
          values: data,
        },
      });
    } catch (error: any) {
      return sendResponseError(res, error);
    }
  }

  // async handleMqttExport(req: any, res: any) {
  //   try {
  //     let startDate = req.query.startDate
  //       ? moment(req.query.startDate).format('YYYY-MM-DD')
  //       : null;
  //     let endDate = req.query.endDate
  //       ? moment(req.query.endDate).format('YYYY-MM-DD')
  //       : null;

  //     let query = db('mqtt_datas as data').select(
  //       'id_mesin',
  //       'waktu_mesin',
  //       'oxygen_purity',
  //       'o2_tank',
  //       'flow_meter',
  //       'flow_meter2',
  //       'total_flow',
  //       'running_time',
  //       'created_at',
  //       'nama_dinas'
  //     );

  //     if (startDate && endDate) {
  //       query = query.whereRaw(
  //         `to_char(created_at, 'YYYY-MM-DD') BETWEEN ? AND ?`,
  //         [startDate, endDate]
  //       );
  //     }

  //     if (req.body.role_id === 'user') {
  //       // Ambil nama_dinas berdasarkan user_id dari tabel machines
  //       const userMachine = await db
  //         .select('nama_dinas')
  //         .from('machines')
  //         .where('id', req.body.user_id)
  //         .first();

  //       if (!userMachine) {
  //         throw createError('Data user not found', 'E_BAD_REQUEST');
  //       }

  //       // Ambil semua id_mesin yang memiliki nama_dinas sama
  //       const mesinList = await db
  //         .select('id_mesin')
  //         .from('machines')
  //         .where('nama_dinas', 'Multigas Medika');

  //       if (!mesinList || mesinList.length === 0) {
  //         throw createError(
  //           "No mesin found for the user's dinas",
  //           'E_BAD_REQUEST'
  //         );
  //       }

  //       const idMesinList: string[] = mesinList.map(
  //         (m: { id_mesin: string }) => m.id_mesin
  //       );

  //       // Filter query berdasarkan semua id_mesin dari dinas tersebut
  //       query = query.whereIn('id_mesin', idMesinList);
  //       console.log('id_mesin:', userMachine.nama_dinas);
  //     }
  //     console.log('Login As :', req.body.role_id);
  //     let data = await query;

  //     data.forEach((item: any, idx: any) => {
  //       item.number = idx + 1;
  //     });

  //     // Create a new workbook
  //     const workbook = new ExcelJS.Workbook();
  //     const sheet = workbook.addWorksheet('Data');

  //     const headers = [
  //       { header: 'No', key: 'number' },
  //       { header: 'ID Mesin', key: 'id_mesin' },
  //       { header: 'Time', key: 'time' },
  //       { header: 'Nama Dinas', key: 'nama_dinas' },
  //       { header: 'Oxygen Purity', key: 'oxygen_purity' },
  //       { header: 'O2 Tank', key: 'o2_tank' },
  //       { header: 'Flow Meter', key: 'flow_meter' },
  //       { header: 'Flow Meter 2', key: 'flow_meter2' },
  //       { header: 'Total Flow', key: 'total_flow' },
  //       { header: 'Running Time', key: 'running_time' },
  //     ];

  //     sheet.columns = headers;

  //     // Add custom headers to the worksheet
  //     headers.forEach((header) => {
  //       const column = sheet.getColumn(header.key);
  //       column.header = header.header;
  //       column.eachCell((cell) => {
  //         // Example of setting cell style (modify as needed)
  //         cell.fill = {
  //           type: 'pattern',
  //           pattern: 'solid',
  //           fgColor: { argb: '95B3D7' },
  //         };
  //         cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  //       });
  //     });

  //     data.forEach((item: any) => {
  //       const row = {
  //         number: item.number,
  //         id_mesin: item.id_mesin,
  //         time: item.waktu_mesin,
  //         nama_dinas: item.nama_dinas,
  //         oxygen_purity: Number(item.oxygen_purity).toFixed(2),
  //         o2_tank: Number(item.o2_tank).toFixed(2),
  //         flow_meter: Number(item.flow_meter).toFixed(2),
  //         flow_meter2: Number(item.flow_meter2).toFixed(2),
  //         total_flow: Number(item.total_flow).toFixed(2),
  //         running_time: Number(item.running_time).toFixed(2),
  //       };
  //       sheet.addRow(row);
  //     });

  //     /* generate buffer */
  //     const excelBuffer = await workbook.xlsx.writeBuffer();

  //     res.header(
  //       'Content-Type',
  //       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  //     );
  //     const filename = `PSA_Reporting_${moment().format(
  //       'YYYYMMDDHHmmsss'
  //     )}.xlsx`;
  //     res.header('Content-Disposition', `attachment; filename="${filename}"`);
  //     return res.status(200).send(excelBuffer);
  //   } catch (error: any) {
  //     if (!errorCodes[error.code]) logger.error(error);

  //     return sendResponseError(res, error);
  //   }
  // }

  async handleMqttExport(req: any, res: any) {
    try {
      const startDate = req.query.startDate
        ? moment(req.query.startDate).format('YYYY-MM-DD')
        : null;
      const endDate = req.query.endDate
        ? moment(req.query.endDate).format('YYYY-MM-DD')
        : null;

      const {
        role_id,
        user_id,
        id_mesin,
        namaDinas,
        sort = 'desc',
      } = req.query;

      // Ambil semua id_mesin milik user jika role 'usr'
      let userIdMesinList: string[] = [];

      if (role_id === 'usr') {
        const userMesins = await db('machines')
          .select('id_mesin')
          .where('dinas_id', user_id);

        if (!userMesins || userMesins.length === 0) {
          throw createError('User tidak memiliki mesin', 'E_BAD_REQUEST');
        }

        userIdMesinList = userMesins.map(
          (m: { id_mesin: string }): string => m.id_mesin
        );
      }

      // Query utama
      let query = db('mqtt_datas as data')
        .join('machines as mcs', 'data.id_mesin', 'mcs.id_mesin')
        .select(
          'data.id_mesin',
          'data.waktu_mesin',
          'data.oxygen_purity',
          'data.o2_tank',
          'data.flow_meter',
          'data.flow_meter2',
          'data.total_flow',
          'data.running_time',
          'data.created_at',
          'mcs.nama_dinas'
        );

      // Filter berdasarkan mesin user
      if (role_id === 'usr') {
        query = query.whereIn('data.id_mesin', userIdMesinList);
      }

      if (startDate) query = query.where('data.created_at', '>=', startDate);
      if (endDate) query = query.where('data.created_at', '<=', endDate);
      if (namaDinas) query = query.where('mcs.nama_dinas', namaDinas);
      if (id_mesin) query = query.where('data.id_mesin', id_mesin);

      query = query.orderBy('data.created_at', sort === 'asc' ? 'asc' : 'desc');

      const data = await query;

      // Total count (tanpa limit)
      const totalQuery = db('mqtt_datas as data')
        .join('machines as mcs', 'data.id_mesin', 'mcs.id_mesin')
        .count('data.id as count');

      if (role_id === 'usr') {
        totalQuery.whereIn('data.id_mesin', userIdMesinList);
      }

      if (startDate) totalQuery.where('data.created_at', '>=', startDate);
      if (endDate) totalQuery.where('data.created_at', '<=', endDate);
      if (namaDinas) totalQuery.where('mcs.nama_dinas', namaDinas);
      if (id_mesin) totalQuery.where('data.id_mesin', id_mesin);

      const totalCountResult = await totalQuery.first();
      const total = parseInt(totalCountResult?.count || '0', 10);

      // Nomor urut
      data.forEach((item: any, idx: number) => {
        item.number = idx + 1;
      });

      // ============ EXPORT EXCEL ============
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data');

      const headers = [
        { header: 'No', key: 'number' },
        { header: 'ID Mesin', key: 'id_mesin' },
        { header: 'Time', key: 'waktu_mesin' },
        { header: 'Nama Dinas', key: 'nama_dinas' },
        { header: 'Oxygen Purity', key: 'oxygen_purity' },
        { header: 'O2 Tank', key: 'o2_tank' },
        { header: 'Flow Meter', key: 'flow_meter' },
        { header: 'Flow Meter 2', key: 'flow_meter2' },
        { header: 'Total Flow', key: 'total_flow' },
        { header: 'Running Time', key: 'running_time' },
        { header: 'Created At', key: 'created_at' },
      ];

      sheet.columns = headers;

      headers.forEach((header) => {
        const column = sheet.getColumn(header.key);
        column.header = header.header;
        column.eachCell((cell) => {
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
          waktu_mesin: item.waktu_mesin,
          nama_dinas: item.nama_dinas,
          oxygen_purity: Number(item.oxygen_purity).toFixed(2),
          o2_tank: Number(item.o2_tank).toFixed(2),
          flow_meter: Number(item.flow_meter).toFixed(2),
          flow_meter2: Number(item.flow_meter2).toFixed(2),
          total_flow: Number(item.total_flow).toFixed(2),
          running_time: Number(item.running_time).toFixed(2),
          created_at: moment(item.created_at).format('YYYY-MM-DD HH:mm:ss'),
        };
        sheet.addRow(row);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `PSA_Reporting_${moment().format(
        'YYYYMMDD_HHmmss'
      )}.xlsx`;

      res
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .status(200)
        .send(buffer);
    } catch (error: any) {
      return sendResponseError(res, error);
    }
  }

  /**
   * API Handle Update Machine
   * @param {*} req
   * @author Febry Prasetyo
   * @date 2025-04-23
   */
  async handleUpdateMachine(req: Request, res: Response) {
    let trx;
    try {
      const { id_lama, id_mesin, dinas_id } = req.body as {
        id_lama: number; // ID lama yang ada di tabel machines
        id_mesin: string;
        dinas_id: number;
      };

      // Validasi parameter yang masuk
      await validateParamsAll(req.body, {
        id_lama: 'required', // Validasi id_lama yang ada di tabel machines
        id_mesin: 'required',
        dinas_id: 'required',
      });

      trx = await db.transaction();

      // 1. Cek apakah mesin dengan ID lama ada
      const machineExists = await trx('machines')
        .where({ id_mesin: id_lama }) // Menggunakan id_lama sebagai pembanding
        .first(); // Cek data berdasarkan ID lama

      if (!machineExists) {
        return sendResponseCustom(res, {
          success: false,
          message: 'Mesin dengan ID lama tersebut tidak ditemukan.',
        });
      }

      // 2. Cek apakah dinas_id (user) ada
      const userExists = await trx('users').where({ id: dinas_id }).first();

      if (!userExists) {
        return sendResponseCustom(res, {
          success: false,
          message:
            'Dinas ID tidak ditemukan. Silakan masukkan data yang benar.',
        });
      }

      // Data yang ditemukan untuk ID lama
      const oldMachineData = machineExists; // Menyimpan data mesin lama

      // Menampilkan data mesin yang akan di-update untuk debugging atau log

      // 1. Update tabel machines terlebih dahulu
      await trx('machines')
        .where({ id_mesin: id_lama }) // Berdasarkan ID lama
        .update({
          id_mesin,
          dinas_id,
          updated_at: trx.fn.now(),
        });

      // 2. Baru update tabel user_machines (karena FK mengarah ke tabel machines)
      await trx('user_machines')
        .where({ id_mesin: id_lama }) // gunakan ID internal mesin
        .update({
          id_mesin,
          dinas_id: dinas_id,
          updated_at: trx.fn.now(),
        });

      // Commit transaksi
      await trx.commit();

      return sendResponseCustom(res, {
        success: true,
        message: 'Mesin berhasil diperbarui.',
      });
    } catch (err: any) {
      if (trx) await trx.rollback();
      return sendResponseError(res, err);
    }
  }
}

// Export the MqttController class
export = MqttController;
