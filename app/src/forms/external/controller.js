const formService = require('../form/service');
const userService = require('../user/service');

module.exports = {
  listFormSubmissions: async (req, res, next) => {
    try {
      const formId = req.headers['x-chefs-form-formid'];
      const idpUserId = req.headers['x-chefs-user-userid'];
      const userRls = await userService.readByIdpUserId(idpUserId);
      const response = await formService.listFormSubmissions(formId, req.query, userRls, true);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
};
