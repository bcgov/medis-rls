const routes = require('express').Router();

const controller = require('./controller');
const jwtService = require('../../components/jwtService');
const P = require('../common/constants').Permissions;
const R = require('../common/constants').Roles;
const { currentUser, hasFormPermissions, hasFormRoles } = require('../auth/middleware/userAccess');

routes.use(currentUser);

routes.get('/:formId', jwtService.protect(), async (req, res, next) => {
  await controller.list(req, res, next);
});

routes.get('/:formId/current', async (req, res, next) => {
  await controller.listCurrentUserRoles(req, res, next);
});

routes.post('/:formId', hasFormPermissions([P.TEAM_UPDATE]), hasFormRoles([R.OWNER, R.TEAM_MANAGER]), async (req, res, next) => {
  await controller.create(req, res, next);
});

routes.put('/:formId', hasFormPermissions([P.TEAM_UPDATE]), hasFormRoles([R.OWNER, R.TEAM_MANAGER]), async (req, res, next) => {
  await controller.update(req, res, next);
});

routes.delete('/:formId', hasFormPermissions([P.TEAM_UPDATE]), hasFormRoles([R.OWNER, R.TEAM_MANAGER]), async (req, res, next) => {
  await controller.delete(req, res, next);
});

module.exports = routes;
