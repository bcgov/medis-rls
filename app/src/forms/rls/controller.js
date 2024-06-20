const service = require('./service');
module.exports = {
  create: async (req, res, next) => {
    try {
      const response = await service.create(req.params.formId, req.body, req.currentUser);
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  },
  list: async (req, res, next) => {
    try {
      const response = await service.list(req.params.formId);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
  update: async (req, res, next) => {
    try {
      const response = await service.update(req.params.formId, req.body, req.currentUser);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
  delete: async (req, res, next) => {
    try {
      const response = await service.delete(req.query.ids);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
};
