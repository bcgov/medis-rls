const service = require('./service');
const userService = require('../user/service');
const formService = require('../form/service');
const _ = require('lodash');
const config = require('config');
const log = require('../../components/log')(module.filename);

module.exports = {
  create: async (req, res, next) => {
    try {
      const response = await service.create(req.params.formId, req.body, req.currentUser);
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  },
  listCurrentUserRoles: async (req, res, next) => {
    const started = Date.now();
    const meta = { function: 'listCurrentUserRoles', requestId: req.requestId, ip: req.ip, userAgent: req.get('user-agent'), idpUserId: req.headers['x-chefs-user-userid'] };
    // Logs why a request was refused. Credentials are never logged.
    const reject = (statusCode, reason, message, extra = {}) => {
      log.warn(`RLS roles request rejected: ${reason}`, { ...meta, ...extra, statusCode });
      return res.status(statusCode).json({ message });
    };
    try {
      const apikeyEnv = config.get('server.externalApiKey');
      let apikeyIncome = req.headers.apikey;

      if (apikeyIncome === undefined || apikeyIncome === '' || !apikeyIncome) {
        return reject(401, 'no API key provided', 'Not authenticated');
      }

      const incomingRlsKey = apikeyIncome.split(':')[0];
      const incomingFormKey = apikeyIncome.split(':')[1];

      if (!incomingFormKey || !incomingRlsKey) {
        return reject(401, 'API key is not in the expected key:secret format', 'Not authenticated');
      }

      if (req.params.formId === 'form' && !req.query?.extFormId) {
        return reject(400, 'extFormId query parameter missing', 'Bad request');
      }

      // use the query param to get the formId
      // TODO: make it consistent across all CHEFS endpoints to use the query
      const formId = req.params.formId === 'form' ? req.query?.extFormId : req.params.formId;
      meta.formId = formId;
      const formApiKey = await formService.readApiKey(formId);

      if (formApiKey.secret !== incomingFormKey || incomingRlsKey !== apikeyEnv) {
        return reject(401, incomingRlsKey !== apikeyEnv ? 'invalid service API key' : 'invalid form secret', 'Not authenticated');
      }

      const idpUserId = req.headers['x-chefs-user-userid'];

      if (!idpUserId) {
        return reject(400, 'x-chefs-user-userid header missing', 'Bad request');
      }

      const userRls = await userService.readByIdpUserId(idpUserId);

      if (!userRls) {
        return reject(401, 'user not found for idp user id', 'Not authenticated');
      }
      const response = await service.listRlsByUserIdAndInternalFormId(userRls.id, formId);

      const responseWithoutIdAndUserId = response.map((r) => _.omit(r, ['id', 'userId', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'customViewName']));

      log.info('RLS roles returned', { ...meta, rlsCount: responseWithoutIdAndUserId.length, statusCode: 200, totalMs: Date.now() - started });
      return res.status(200).json(responseWithoutIdAndUserId);
    } catch (error) {
      log.error(`RLS roles request failed: ${error?.message}`, { ...meta, error: error?.message, totalMs: Date.now() - started });
      next(error);
    }
  },
  list: async (req, res, next) => {
    try {
      const response = await service.list(req.params.formId);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
  update: async (req, res, next) => {
    try {
      const response = await service.update(req.params.formId, req.body, req.currentUser);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
  delete: async (req, res, next) => {
    try {
      const response = await service.delete(req.params.formId, req.query.ids);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
};
