const axios = require('axios');
const formService = require('../form/service');
const userService = require('../user/service');
const rlsService = require('../rls/service');
const config = require('config');
const _ = require('lodash');

const CHEFS_API_ENDPOINT = 'https://submit.digital.gov.bc.ca/app/api/v1';

module.exports = {
  listFormSubmissions: async (req, res, next) => {
    try {
      const remoteFormId = req.headers['x-chefs-form-formid'];
      const idpUserId = req.headers['x-chefs-user-userid'];
      const userRls = await userService.readByIdpUserId(idpUserId);
      const formId = req.query?.extFormId;
      // if req.extFormApiKey exist we need to fetch CHEFS submission data instead
      if (req.extFormApiKey) {
        const axiosOptions = { timeout: 10000 };
        const axiosInstance = axios.create(axiosOptions);
        const basicAuthEncoded = Buffer.from(formId + ':' + req.extFormApiKey).toString('base64');
        axiosInstance.interceptors.request.use(
          (cfg) => {
            cfg.headers = { authorization: `Basic ${basicAuthEncoded}` };
            return Promise.resolve(cfg);
          },
          (error) => {
            return Promise.reject(error);
          }
        );
        const remoteSubmissionData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/forms/${formId}/export?format=json&type=submissions`);
        res.status(200).json(remoteSubmissionData?.data);
      } else {
        const response = await formService.listFormSubmissions(formId, req.query, userRls, remoteFormId, true);
        res.status(200).json(response);
      }
    } catch (error) {
      next(error);
    }
  },
  listFormSubmissionsWithFields: async (req, res, next) => {
    try {
      const apikeyEnv = config.get('server.externalApiKey');
      let apikeyIncome = req.headers.apikey;
      let extFormApiKey = null;
      if (apikeyIncome.includes(':')) {
        extFormApiKey = apikeyIncome.split(':')[1];
        apikeyIncome = apikeyIncome.split(':')[0];
      }
      req.extFormApiKey = extFormApiKey;
      if (apikeyIncome === undefined || apikeyIncome === '' || !apikeyIncome) {
        return res.status(401).json({ message: 'No API key provided' });
      }
      if (apikeyIncome !== apikeyEnv) {
        return res.status(401).json({ message: 'Invalid API key' });
      }
      const formId = req.query?.extFormId;
      const filter = req.query?.filter;

      const idpUserId = req.headers['x-chefs-user-userid'];
      const userRls = await userService.readByIdpUserId(idpUserId);

      // if req.extFormApiKey exist we need to fetch CHEFS submission data instead
      if (req.extFormApiKey) {
        const queries = req.query;
        let queriesOptionsWithoutId = _.omit(queries, ['extFormId', 'filter']);
        const axiosOptions = { timeout: 10000 };
        const axiosInstance = axios.create(axiosOptions);
        const basicAuthEncoded = Buffer.from(formId + ':' + req.extFormApiKey).toString('base64');
        axiosInstance.interceptors.request.use(
          (cfg) => {
            cfg.headers = { authorization: `Basic ${basicAuthEncoded}` };
            return Promise.resolve(cfg);
          },
          (error) => {
            return Promise.reject(error);
          }
        );
        const roles = await rlsService.listRlsByUserIdAndRemoteFormId(userRls.id, formId);

        if (roles.length > 0) {
          queriesOptionsWithoutId = {
            ...queriesOptionsWithoutId,
            fields: queriesOptionsWithoutId.fields + ',' + roles.map((role) => role.remoteFieldKey.split('.')[0]).join(','),
          };
        }

        const remoteSubmissionData = await axiosInstance.get(
          `${CHEFS_API_ENDPOINT}/forms/${formId}/submissions${queriesOptionsWithoutId ? `?${new URLSearchParams(queriesOptionsWithoutId).toString()}` : ''}`
        );

        if (!filter) {
          return res.status(200).json(remoteSubmissionData?.data);
        }

        if (roles.length === 0) {
          return res.status(200).json(remoteSubmissionData?.data);
        }

        const filteredSubmissions = roles.map((role) => {
          return remoteSubmissionData?.data.filter((submission) => {
            const nestedPath = role.remoteFieldKey ? role.remoteFieldKey.split('.') : null;

            if (nestedPath) {
              return _.get(submission, nestedPath) === role.value;
            }

            return true;
          });
        });

        res.status(200).json(filteredSubmissions);
      } else {
        return res.status(400).json({ message: 'Bad Request' });
      }
    } catch (err) {
      next(err);
    }
  },
};
