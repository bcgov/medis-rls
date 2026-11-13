const axios = require('axios');
const config = require('config');
const crypto = require('crypto');
const service = require('./service');
const log = require('../../components/log')(module.filename);
const { describeShape, loggable } = require('../../components/logSummary');

const CHEFS_API_ENDPOINT = 'https://submit.digital.gov.bc.ca/app/api/v1';

// const service = require('./service');

module.exports = {
  webhooks: async (req, res) => {
    const started = Date.now();
    const requestId = req.requestId || crypto.randomUUID();
    const webhookPayload = req.body;
    const meta = {
      function: 'webhooks',
      requestId,
      formId: webhookPayload?.formId,
      submissionId: webhookPayload?.submissionId,
      subscriptionEvent: webhookPayload?.subscriptionEvent,
    };
    // Tracks how far processing got, so a failure says where it happened.
    let step = 'received';
    // Note: the name of the secret header is itself the webhook secret, so
    // header names are not logged on accepted requests. They are logged only
    // when the secret header is missing (see below), to diagnose rejections.
    log.info('Webhook received', {
      ...meta,
      receivedAt: new Date(started).toISOString(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      contentLength: req.get('content-length'),
      payload: loggable(webhookPayload),
    });

    try {
      // const response = await service.read(req.params.formSubmissionId);
      if (req.headers && Object.prototype.hasOwnProperty.call(req.headers, config.get('server.webhookSecret'))) {
        const remoteFormApiKey = req.headers[config.get('server.webhookSecret')];
        if (!webhookPayload?.formId) {
          log.warn('Webhook rejected: payload does not have formId', { ...meta, ip: req.ip, payloadShape: describeShape(webhookPayload) });
          return res.status(400).json({ message: 'Bad request' });
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

        let formCreated = false;
        if (webhookPayload.subscriptionEvent === 'eventSubmission') {
          step = 'checkIfFormExist';
          const remoteFormExist = await service.checkIfFormExist(webhookPayload.formId);

          step = 'fetchSubmissionFromChefs';
          const fetchStarted = Date.now();
          const remoteSubmissionData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/submissions/${webhookPayload.submissionId}`);
          const remoteSubmission = remoteSubmissionData?.data?.submission;
          log.info('Webhook fetched submission from CHEFS', {
            ...meta,
            durationMs: Date.now() - fetchStarted,
            status: remoteSubmissionData?.status,
            bytes: Number(remoteSubmissionData?.headers?.['content-length']) || undefined,
            draft: remoteSubmission?.draft,
            fieldCount: remoteSubmission?.submission?.data ? Object.keys(remoteSubmission.submission.data).length : undefined,
            formExistsLocally: remoteFormExist,
          });

          step = 'getUserFromRemote';
          const getRemoteUser = await service.getUserFromRemote(remoteSubmission?.createdBy);
          const currentUser = { id: getRemoteUser.id };
          if (remoteFormExist) {
            // Form already exist trying to create a submission then
            step = 'createSubmissionFromRemote';
            await service.createSubmissionFromRemote(webhookPayload.formVersion, remoteSubmission, currentUser);
          } else {
            // Form is not exist, create one then but first get info about this from from CHEFS API
            step = 'fetchFormFromChefs';
            const remoteFormData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/forms/${webhookPayload.formId}`);
            // Getting the remote form published version info
            const remoteVersionPublished = remoteFormData?.data?.versions.filter((v) => v.published === true)[0];
            step = 'fetchFormVersionFromChefs';
            const remoteVersionData = await axiosInstance.get(`${CHEFS_API_ENDPOINT}/forms/${webhookPayload.formId}/versions/${webhookPayload.formVersion}`);
            step = 'createFromRemoteForm';
            await service.createFromRemoteForm(remoteFormData.data, remoteVersionPublished.version, remoteVersionPublished.id, remoteVersionData.data.schema);
            formCreated = true;
            log.info('Webhook created the form locally', { ...meta, formName: remoteFormData?.data?.name, publishedVersion: remoteVersionPublished?.version });
            // Finally, create a submission
            step = 'createSubmissionFromRemote';
            await service.createSubmissionFromRemote(webhookPayload.formVersion, remoteSubmission, currentUser);
          }
          log.info('Webhook stored submission', { ...meta, formCreated, completedAt: new Date().toISOString(), totalMs: Date.now() - started });
        } else {
          log.info('Webhook ignored: event type is not handled', { ...meta, completedAt: new Date().toISOString(), totalMs: Date.now() - started });
        }
        res.status(200).json({ message: 'webhook executed ok...' });
      } else {
        // TEMPORARY diagnostic: log incoming header names so a misconfigured CHEFS
        // subscription can be diagnosed. Remove once the issue is resolved.
        const configuredHeader = String(config.get('server.webhookSecret') || '');
        const headerNames = Object.keys(req.headers || {});
        log.warn('Webhook rejected: secret header missing', {
          ...meta,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          headerNames,
          configuredHeaderLength: configuredHeader.length,
          configuredHeaderIsLowercase: configuredHeader === configuredHeader.toLowerCase(),
          caseInsensitiveMatch: headerNames.some((h) => h.toLowerCase() === configuredHeader.toLowerCase()),
        });
        res.status(400).json({ message: 'Bad request' });
      }
    } catch (error) {
      // Log the message only: axios errors carry the request config, including the Authorization header.
      log.error(`Webhook failed at ${step}: ${error?.message}`, {
        ...meta,
        function: 'webhooks',
        step,
        status: error?.response?.status,
        code: error?.code,
        failedAt: new Date().toISOString(),
        totalMs: Date.now() - started,
      });
      res.status(500).json({ message: 'Webhook executed but something went wrong...' });
    }
  },
};
