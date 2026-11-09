const formService = require('../form/service');
const userService = require('../user/service');
const rlsService = require('../rls/service');
const config = require('config');
const _ = require('lodash');
const crypto = require('crypto');
const log = require('../../components/log')(module.filename);
const { cachedGet, isValidFormId } = require('./upstream');

/**
 * Logs one line describing an incoming external request. Never logs the
 * apikey header or the CHEFS secret.
 */
const logRequest = (req, endpoint, extra = {}) =>
  log.info(`External ${endpoint} request`, {
    function: endpoint,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    formId: req.query?.extFormId,
    idpUserId: req.headers['x-chefs-user-userid'],
    remoteFormId: req.headers['x-chefs-form-formid'],
    ...extra,
  });

module.exports = {
  listFormSubmissions: async (req, res, next) => {
    const started = Date.now();
    req.requestId = crypto.randomUUID();
    try {
      const remoteFormId = req.headers['x-chefs-form-formid'];
      const idpUserId = req.headers['x-chefs-user-userid'];
      const userRls = await userService.readByIdpUserId(idpUserId);
      const formId = req.query?.extFormId;
      // if req.extFormApiKey exist we need to fetch CHEFS submission data instead
      if (req.extFormApiKey) {
        if (!isValidFormId(formId)) return res.status(400).json({ message: 'Invalid extFormId' });
        logRequest(req, 'listFormSubmissions', { source: 'chefs' });
        const remote = await cachedGet({
          formId,
          secret: req.extFormApiKey,
          resource: 'export',
          query: { format: 'json', type: 'submissions' },
          requestId: req.requestId,
        });
        log.info('External listFormSubmissions completed', {
          function: 'listFormSubmissions',
          requestId: req.requestId,
          formId,
          cache: remote.cache,
          statusCode: 200,
          totalMs: Date.now() - started,
        });
        res.status(200).json(remote.data);
      } else {
        logRequest(req, 'listFormSubmissions', { source: 'local' });
        const response = await formService.listFormSubmissions(formId, req.query, userRls, remoteFormId, true);
        res.status(200).json(response);
      }
    } catch (error) {
      next(error);
    }
  },
  listFormSubmissionsWithFields: async (req, res, next) => {
    const started = Date.now();
    req.requestId = crypto.randomUUID();
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
        if (!isValidFormId(formId)) return res.status(400).json({ message: 'Invalid extFormId' });
        const queries = req.query;
        let queriesOptionsWithoutId = _.omit(queries, ['extFormId', 'filter']);
        const roles = await rlsService.listRlsByUserIdAndRemoteFormId(userRls.id, formId);
        logRequest(req, 'listFormSubmissionsWithFields', { source: 'chefs', filter: Boolean(filter), rlsRoles: roles.length, fields: queries.fields });

        if (roles.length > 0) {
          queriesOptionsWithoutId = {
            ...queriesOptionsWithoutId,
            fields: queriesOptionsWithoutId.fields + ',' + roles.map((role) => role.remoteFieldKey.split('.')[0]).join(','),
          };
        }

        const remote = await cachedGet({
          formId,
          secret: req.extFormApiKey,
          resource: 'submissions',
          query: queriesOptionsWithoutId,
          requestId: req.requestId,
        });
        const remoteSubmissionData = { data: remote.data };
        const done = (count) =>
          log.info('External listFormSubmissionsWithFields completed', {
            function: 'listFormSubmissionsWithFields',
            requestId: req.requestId,
            formId,
            cache: remote.cache,
            statusCode: 200,
            returnedGroups: count,
            totalMs: Date.now() - started,
          });

        if (!filter) {
          done(undefined);
          return res.status(200).json(remoteSubmissionData?.data);
        }

        if (roles.length === 0) {
          done(undefined);
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

        done(filteredSubmissions.length);
        res.status(200).json(filteredSubmissions);
      } else {
        log.warn('External listFormSubmissionsWithFields rejected: no CHEFS secret in apikey', { function: 'listFormSubmissionsWithFields', requestId: req.requestId, ip: req.ip });
        return res.status(400).json({ message: 'Bad Request' });
      }
    } catch (err) {
      next(err);
    }
  },
};
