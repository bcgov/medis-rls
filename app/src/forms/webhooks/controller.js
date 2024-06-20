const axios = require('axios');
const config = require('config');
const service = require('./service');

const CHEFS_API_ENDPOINT = 'https://submit.digital.gov.bc.ca/app/api/v1';

// const service = require('./service');

module.exports = {
  webhooks: async (req, res) => {
    try {
      // const response = await service.read(req.params.formSubmissionId);
      if (req.headers && Object.prototype.hasOwnProperty.call(req.headers, config.get('server.webhookSecret'))) {
        const remoteFormApiKey = req.headers[config.get('server.webhookSecret')];
        const webhookPayload = req.body;
        if (!webhookPayload?.formId) {
          // eslint-disable-next-line no-console
          console.error('Webhook payload does not have FormId');
          res.status(400).json({ message: 'Bad request' });
        }
        const axiosOptions = { timeout: 10000 };
        const axiosInstance = axios.create(axiosOptions);
        const basicAuthEncoded = Buffer.from(webhookPayload.formId + ':' + remoteFormApiKey).toString('base64');
        axiosInstance.interceptors.request.use(
          (cfg) => {
            cfg.headers = { authorization: `Basic ${basicAuthEncoded}` };
            return Promise.resolve(cfg);
          },
          (error) => {
            return Promise.reject(error);
          }
        );

        if (webhookPayload.subscriptionEvent === 'eventSubmission') {
          const remoteFormExist = await service.checkIfFormExist(webhookPayload.formId);
          const remoteSubmissionData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/submissions/${webhookPayload.submissionId}`);
          const getRemoteUser = await service.getUserFromRemote(remoteSubmissionData?.data?.submission.createdBy);
          const currentUser = { id: getRemoteUser.id };
          if (remoteFormExist) {
            // Form already exist trying to create a submission then
            await service.createSubmissionFromRemote(webhookPayload.formVersion, remoteSubmissionData?.data?.submission, currentUser);
          } else {
            // Form is not exist, create one then but first get info about this from from CHEFS API
            const remoteFormData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/forms/${webhookPayload.formId}`);
            // Getting the remote form published version info
            const remoteVersionPublished = remoteFormData?.data?.versions.filter((v) => v.published === true)[0];
            const remoteVersionData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/forms/${webhookPayload.formId}/versions/${webhookPayload.formVersion}`);
            await service.createFromRemoteForm(remoteFormData.data, remoteVersionPublished.version, remoteVersionPublished.id, remoteVersionData.data.schema);
            // Finally, create a submission
            await service.createSubmissionFromRemote(webhookPayload.formVersion, remoteSubmissionData?.data?.submission, currentUser);
          }
        }
        res.status(200).json({ message: 'webhook executed ok...' });
      } else {
        res.status(400).json({ message: 'Bad request' });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
      res.status(500).json({ message: 'Webhook executed but something went wrong...' });
    }
  },
};
