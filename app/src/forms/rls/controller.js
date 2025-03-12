const service = require('./service');
const userService = require('../user/service');
const formService = require('../form/service');
const _ = require('lodash');
const config = require('config');

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
    try {
      const apikeyEnv = config.get('server.externalApiKey');
      let apikeyIncome = req.headers.apikey;

      if (apikeyIncome === undefined || apikeyIncome === '' || !apikeyIncome) {
        return res.status(401).json({ message: 'No API key provided' });
      }

      const incomingRlsKey = apikeyIncome.split(':')[0];
      const incomingFormKey = apikeyIncome.split(':')[1];

      if (!incomingFormKey || !incomingRlsKey) {
        return res.status(401).json({ message: 'No API key provided' });
      }

      const formId = req.params.formId;
      const formApiKey = await formService.readApiKey(formId);

      if (formApiKey.secret !== incomingFormKey || incomingRlsKey !== apikeyEnv) {
        return res.status(401).json({ message: 'Invalid API key' });
      }

      const idpUserId = req.headers['x-chefs-user-userid'];

      if (!idpUserId) {
        return res.status(400).json({ message: 'Bad request' });
      }

      const userRls = await userService.readByIdpUserId(idpUserId);

      if (!userRls) {
        return res.status(401).json({ message: 'User not found' });
      }
      const response = await service.listRlsByUserIdAndInternalFormId(userRls.id, req.params.formId);

      const responseWithoutIdAndUserId = response.map((r) => _.omit(r, ['id', 'userId', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'customViewName']));

      return res.status(200).json(responseWithoutIdAndUserId);
    } catch (error) {
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
