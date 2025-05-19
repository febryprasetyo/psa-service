import {
  logger,
  db,
  createError,
  errorCodes,
  moment,
  replaceCommaDot,
} from '../utils/util';
import bcrypt from 'bcrypt';
import jwt from 'jwt-simple';
import { create } from 'lodash';
class ModelUser {
  /**
   * Function handle login
   * @param {any}
   * @author Febry Prasetyo
   * @date 2025-04-14
   */
  async login(values: any) {
    try {
      let data = await db
        .select(
          db.raw(`
        mu.id as user_id, mu.username, mu.fullname,  mu.password, mu.role_id, mu.is_active, mu.jwt_age, rl.role_name, mu.nama_dinas, mu.alamat
      `)
        )
        .from('users AS mu')
        .leftJoin(db.raw(`roles AS rl ON rl.id = mu.role_id`))
        .whereRaw('mu.username = ?', [values.username])
        .whereRaw('mu.is_active');

      if (data.length === 0)
        throw createError('Username tidak ditemukan!', 'E_UNAUTHORIZED');
      data = data[0];

      const validPassword = await bcrypt.compare(
        values.password,
        data.password
      );
      if (!validPassword)
        throw createError('Password invalid!', 'E_UNAUTHORIZED');

      let result: any = {
        user_data: {
          user_id: data.user_id,
          username: data.username,
          fullname: data.fullname,
          is_active: data.is_active,
          role_id: data.role_id,
          role_name: data.role_name,
          alamat: data.alamat,
          nama_dinas: data.nama_dinas,
          created_at: moment(data.created_at).format('YYYY-MM-DD HH:mm:ss'),
        },
      };

      let expDate = Date.now() + data.jwt_age * 1000;
      let userData = data.user_id;
      let jwtKey: any = process.env.JWT_SECRET_KEY;
      let token = jwt.encode(
        { exp: expDate, userData: result.user_data },
        jwtKey
      );

      result.token = {
        access_token: token,
        expires_in: data.jwt_age,
        type: 'Bearer',
      };

      return result;
    } catch (error: any) {
      if (!errorCodes[error.code]) logger.error(error);

      throw error;
    }
  }
}

export = ModelUser;
