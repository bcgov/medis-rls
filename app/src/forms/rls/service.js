// const Problem = require('api-problem');
const { v4: uuidv4 } = require('uuid');
const { FormRls } = require('../common/models');

const service = {
  list: async (formId) => {
    return await FormRls.query().modify('filterFormId', formId);
  },
  create: async (formId, data, currentUser) => {
    let trx;
    try {
      trx = await FormRls.startTransaction();

      for (const user of data.users) {
        const obj = Object.assign(
          {},
          {
            formId: formId,
            userId: user.id,
            field: data.field,
            value: data.value,
            nestedPath: data.nestedPath,
            createdBy: currentUser.usernameIdp,
          }
        );
        obj.id = uuidv4();

        await FormRls.query(trx).insert(obj);
      }
      await trx.commit();
      return true;
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },

  update: async (formId, data, currentUser) => {
    let trx;
    try {
      trx = await FormRls.startTransaction();

      for (const user of data.users) {
        const obj = await service.read(user.id, formId);
        const update = Object.assign(
          {},
          {
            formId: formId,
            field: data.field,
            value: data.value,
            nestedPath: data.nestedPath,
            updatedBy: currentUser.usernameIdp,
          }
        );

        await FormRls.query(trx).patchAndFetchById(obj.id, update);
      }

      await trx.commit();
      return true;
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },

  read: async (userId, formId) => {
    return await FormRls.query().modify('filterFormId', formId).modify('filterUserId', userId).first();
  },

  delete: async (ids) => {
    let trx;
    try {
      trx = await FormRls.startTransaction();

      const idsToDelete = ids.split(',');
      for (const id of idsToDelete) {
        await FormRls.query().deleteById(id).throwIfNotFound();
      }

      await trx.commit();
      return true;
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },
};

module.exports = service;
