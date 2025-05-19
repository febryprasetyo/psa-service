import * as express from 'express';

//Controller
import MqttController from '../../controllers/MqttContoller';
import { DataMonitoringController } from '../../controllers/DataMonitoring';
const DataMonitoringCtl = new DataMonitoringController();
const MqttCtl = new MqttController();

import { JwtMiddleware } from '../../middlewares/jwtMiddleware';

let router = express.Router();

router.post('/user/create', JwtMiddleware('adm'), MqttCtl.handleCreateUser);
router.post('/user/update', JwtMiddleware('adm'), MqttCtl.handleUpdateUser); // ok
router.post('/user/remove', JwtMiddleware('adm'), MqttCtl.handleRemoveUser); // feature
router.post('/user/list', JwtMiddleware('adm:user'), MqttCtl.handleListUser); // ok

router.post('/machine/add', JwtMiddleware('adm'), MqttCtl.handleCreateMachine); // OK
router.post(
  '/machine/update',
  JwtMiddleware('adm'),
  MqttCtl.handleUpdateMachine
); // OK
router.post(
  '/machine/remove',
  JwtMiddleware('adm'),
  MqttCtl.handleRemoveMachine
); // OK
router.post('/machine/list', JwtMiddleware('adm'), MqttCtl.handleListMachine); // OK

router.get('/list', JwtMiddleware('adm:user'), MqttCtl.handleMqttList);
router.get('/export', JwtMiddleware('adm:user'), MqttCtl.handleMqttExport);
// router.get('/dashboard', MqttCtl.handleMqttDashboard);

router.get('/monitoring', JwtMiddleware('adm:user'), (req, res) =>
  DataMonitoringCtl.handlerMonitoring(req, res)
);
export = router;
