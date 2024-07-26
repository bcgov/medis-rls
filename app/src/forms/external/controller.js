const formService = require('../form/service');
const userService = require('../user/service');

module.exports = {
  listFormSubmissions: async (req, res, next) => {
    try {
      //const remoteFormId = req.headers['x-chefs-form-formid'];
      const idpUserId = req.headers['x-chefs-user-userid'];
      const userRls = await userService.readByIdpUserId(idpUserId);
      const formId = req.query?.extFormId;
      const response = await formService.listFormSubmissions(formId, req.query, userRls, /*remoteFormId,*/ true);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
};
