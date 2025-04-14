import * as express from 'express';

//Controller
import MqttController from '../../controllers/MqttContoller';
const MqttCtl = new MqttController()

import { JwtMiddleware } from '../../middlewares/jwtMiddleware';

let router = express.Router()

router.post('/user/create', JwtMiddleware('adm'), MqttCtl.handleCreateUser)
router.post('/user/update', JwtMiddleware('adm'), MqttCtl.handleUpdateUser)
router.post('/user/remove', JwtMiddleware('adm'), MqttCtl.handleRemoveUser)
router.post('/user/list', JwtMiddleware('adm:user'), MqttCtl.handleListUser)

router.get('/list', JwtMiddleware('adm:user'), MqttCtl.handleMqttList)
router.get('/export', JwtMiddleware('adm:user'), MqttCtl.handleMqttExport)
router.get('/dashboard', MqttCtl.handleMqttDashboard)

export = router