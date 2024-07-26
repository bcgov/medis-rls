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
        for (const rls of data.rlsItems) {
          const obj = Object.assign(
            {},
            {
              formId: formId,
              userId: user.id,
              field: rls.field,
              value: rls.value,
              customViewName: data.customViewName,
              createdBy: currentUser.usernameIdp,
            }
          );
          obj.id = uuidv4();
          await FormRls.query(trx).insert(obj);
        }
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
        // we still can get cases when we remove RLS on frontend but it's still in DB,
        // so we need to delete it in DB as well
        const userRls = await service.read(user.id, formId);
        const payloadRlsIds = data.rlsItems.map((ri) => ri.id);
        const idsNotInPayload = userRls.filter((ur) => !payloadRlsIds.includes(ur.id));
        if (idsNotInPayload && idsNotInPayload.length > 0) {
          for (const deleteId of idsNotInPayload) {
            await FormRls.query().deleteById(deleteId.id);
          }
        }
        for (const rls of data.rlsItems) {
          if (rls.id) {
            const update = Object.assign(
              {},
              {
                formId: formId,
                field: rls.field,
                value: rls.value,
                customViewName: data.customViewName,
                updatedBy: currentUser.usernameIdp,
              }
            );
            await FormRls.query(trx).patchAndFetchById(rls.id, update);
          } else {
            const obj = Object.assign(
              {},
              {
                formId: formId,
                userId: user.id,
                field: rls.field,
                value: rls.value,
                customViewName: data.customViewName,
                createdBy: currentUser.usernameIdp,
              }
            );
            obj.id = uuidv4();
            await FormRls.query(trx).insert(obj);
          }
        }
      }
      await trx.commit();
      return true;
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },

  read: async (userId, formId) => {
    return await FormRls.query().modify('filterFormId', formId).modify('filterUserId', userId);
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
