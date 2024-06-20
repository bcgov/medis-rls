const routes = require('express').Router();

const controller = require('./controller');

routes.post('/', async (req, res, next) => {
  await controller.webhooks(req, res, next);
});

module.exports = routes;
