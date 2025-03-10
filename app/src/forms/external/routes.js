const routes = require('express').Router();
const controller = require('./controller');
const config = require('config');

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
      console.log('apikeyIncome:', apikeyIncome);
      console.log('extFormApiKey:', extFormApiKey);
      if (apikeyIncome === undefined || apikeyIncome === '' || !apikeyIncome) {
        return res.status(401).json({ message: 'No API key provided' });
      }
      if (apikeyIncome === apikeyEnv) {
        next();
      } else {
        return res.status(401).json({ message: 'Invalid API key' });
      }
    } else {
      return res.status(404).json({ message: 'Only GET request is accepted' });
    }
  } catch (err) {
    console.error('Error in listFormSubmissions:', err);
    return res.status(500).json({ message: err.message });
  }
});

routes.get('/submissions', async (req, res, next) => {
  await controller.listFormSubmissions(req, res, next);
});

module.exports = routes;
