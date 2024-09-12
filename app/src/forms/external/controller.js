const axios = require('axios');
const formService = require('../form/service');
const userService = require('../user/service');

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
};
