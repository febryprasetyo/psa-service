import { Request, Response } from 'express';
import { db } from '../utils/util';
import moment from 'moment';

interface MqttData {
  id: number;
  id_mesin: string;
  fullname: string | null;
  created_at: string;
  oxygen_purity: number;
  o2_tank: number;
  flow_meter: number;
  flow_meter2: number;
  total_flow: number;
  running_time: number;
  last_update: string;
}

// export class DataMonitoringController {
//   async handlerMonitoring(req: Request, res: Response) {
//     try {
//       const user_id = req.body.user_id;
//       const role_id = req.body.role_id;

//       let allowedMachineIds: string[] = [];

//       if (role_id !== 'adm') {
//         // Ambil semua mesin yang dimiliki user dari tabel relasi user_machines
//         allowedMachineIds = await db('user_machines')
//           .where('dinas_id', user_id)
//           .pluck('id_mesin');
//       }

//       // Ambil data terbaru per id_mesin dari mqtt_datas
//       const latestData = await db
//         .raw(
//           `
//           SELECT DISTINCT ON (id_mesin)
//             id,
//             id_mesin,
//             oxygen_purity,
//             o2_tank,
//             flow_meter,
//             flow_meter2,
//             total_flow,
//             running_time,
//             created_at as last_update
//           FROM mqtt_datas
//           ORDER BY id_mesin, created_at DESC
//         `
//         )
//         .then((result: { rows: any[] }) => result.rows);

//       const nowMoment = moment();

//       const result = latestData
//         .filter((item: { id_mesin: string }) => {
//           if (role_id === 'adm') return true;
//           return allowedMachineIds.includes(item.id_mesin);
//         })
//         .map(
//           (item: {
//             last_update: moment.MomentInput;
//             id: any;
//             id_mesin: any;
//             oxygen_purity: any;
//             o2_tank: any;
//             flow_meter: any;
//             flow_meter2: any;
//             total_flow: any;
//             running_time: any;
//           }) => {
//             const lastUpdate = moment(item.last_update);
//             const minutesDiff = nowMoment.diff(lastUpdate, 'minutes');
//             const status = minutesDiff <= 5 ? 'hidup' : 'mati';

//             return {
//               id: item.id,
//               id_mesin: item.id_mesin,
//               oxygen_purity: item.oxygen_purity,
//               o2_tank: item.o2_tank,
//               flow_meter: item.flow_meter,
//               flow_meter2: item.flow_meter2,
//               total_flow: item.total_flow,
//               running_time: item.running_time,
//               status,
//               minutesDiff,
//               last_update: lastUpdate.format('DD/MM/YYYY HH:mm:ss'),
//             };
//           }
//         );
//       console.log('User ID:', user_id);
//       console.log('Role:', role_id);
//       console.log('Allowed IDs:', allowedMachineIds);
//       console.log(
//         'Latest Data:',
//         latestData.map((d: { id_mesin: any }) => d.id_mesin)
//       );
//       res.json({
//         success: true,
//         total: result.length,
//         data: result,
//       });
//     } catch (error) {
//       console.error('❌ Error in handlerMonitoring:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Internal Server Error',
//       });
//     }
//   }
// }

export class DataMonitoringController {
  async handlerMonitoring(req: Request, res: Response) {
    try {
      const user_id = req.body.user_id;
      const role_id = req.body.role_id;

      let allowedMachineIds: string[] = [];

      if (role_id !== 'adm') {
        // Ambil semua mesin yang dimiliki user dari tabel relasi user_machines
        allowedMachineIds = await db('user_machines')
          .where('dinas_id', user_id)
          .pluck('id_mesin');
      }

      // Ambil data terbaru per id_mesin dari mqtt_datas dan join dengan machines
      const latestData = await db
        .raw(
          `
          SELECT DISTINCT ON (mqtt.id_mesin)
            mqtt.id,
            mqtt.id_mesin,
            m.nama_dinas,
            mqtt.oxygen_purity,
            mqtt.o2_tank,
            mqtt.flow_meter,
            mqtt.flow_meter2,
            mqtt.total_flow,
            mqtt.running_time,
            mqtt.created_at as last_update
          FROM mqtt_datas mqtt
          JOIN machines m ON mqtt.id_mesin = m.id_mesin
          ORDER BY mqtt.id_mesin, mqtt.created_at DESC
        `
        )
        .then((result: { rows: any[] }) => result.rows);

      const nowMoment = moment();

      const result = latestData
        .filter((item: { id_mesin: string }) => {
          if (role_id === 'adm') return true;
          return allowedMachineIds.includes(item.id_mesin);
        })
        .map(
          (item: {
            last_update: moment.MomentInput;
            id: any;
            id_mesin: any;
            nama_dinas: string;
            oxygen_purity: any;
            o2_tank: any;
            flow_meter: any;
            flow_meter2: any;
            total_flow: any;
            running_time: any;
          }) => {
            const lastUpdate = moment(item.last_update);
            const minutesDiff = nowMoment.diff(lastUpdate, 'minutes');
            const status = minutesDiff <= 5 ? 'hidup' : 'mati';

            return {
              id: item.id,
              id_mesin: item.id_mesin,
              nama_dinas: item.nama_dinas,
              oxygen_purity: item.oxygen_purity,
              o2_tank: item.o2_tank,
              flow_meter: item.flow_meter,
              flow_meter2: item.flow_meter2,
              total_flow: item.total_flow,
              running_time: item.running_time,
              status,
              minutesDiff,
              last_update: lastUpdate.format('DD/MM/YYYY HH:mm:ss'),
            };
          }
        );

      console.log('User ID:', user_id);
      console.log('Role:', role_id);
      console.log('Allowed IDs:', allowedMachineIds);
      console.log(
        'Latest Data:',
        latestData.map((d: { id_mesin: any }) => d.id_mesin)
      );

      res.json({
        success: true,
        total: result.length,
        data: result,
      });
    } catch (error) {
      console.error('❌ Error in handlerMonitoring:', error);
      res.status(500).json({
        success: false,
        message: 'Internal Server Error',
      });
    }
  }
}
