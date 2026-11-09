const routes = require('express').Router();
const controller = require('./controller');
const config = require('config');
const upstream = require('./upstream');
const log = require('../../components/log')(module.filename);

routes.use('/submissions', (req, res, next) => {
  // eslint-disable-next-line no-empty
  try {
    if (req.method == 'GET') {
      const apikeyEnv = config.get('server.externalApiKey');
      let apikeyIncome = req.headers.apikey;
      let extFormApiKey = null;
      if (apikeyIncome.includes(':')) {
        extFormApiKey = apikeyIncome.split(':')[1];
        apikeyIncome = apikeyIncome.split(':')[0];
      }
      req.extFormApiKey = extFormApiKey;
      if (apikeyIncome === undefined || apikeyIncome === '' || !apikeyIncome) {
        log.warn('External request rejected: no API key provided', { function: 'submissionsAuth', ip: req.ip, path: req.path });
        return res.status(401).json({ message: 'No API key provided' });
      }
      if (apikeyIncome === apikeyEnv) {
        next();
      } else {
        log.warn('External request rejected: invalid API key', { function: 'submissionsAuth', ip: req.ip, path: req.path });
        return res.status(401).json({ message: 'Invalid API key' });
      }
    } else {
      log.warn(`External request rejected: ${req.method} not accepted`, { function: 'submissionsAuth', ip: req.ip, path: req.path });
      return res.status(404).json({ message: 'Only GET request is accepted' });
    }
  } catch (err) {
    log.error('Error in external submissions auth', { function: 'submissionsAuth', ip: req.ip, path: req.path, error: err.message });
    return res.status(500).json({ message: err.message });
  }
});

routes.get('/submissions', async (req, res, next) => {
  await controller.listFormSubmissions(req, res, next);
});

routes.get('/listSubmissions', async (req, res, next) => {
  await controller.listFormSubmissionsWithFields(req, res, next);
});

// Answer upstream (CHEFS) failures with a 502/504 here so they never reach the
// global error handler, which resets the database connection pool.
routes.use(upstream.errorHandler);

module.exports = routes;
