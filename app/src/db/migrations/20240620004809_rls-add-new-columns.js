exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form_rls', (table) => {
      table.string('nestedPath', 1000).nullable();
      table.uuid('remoteFormId').nullable();
      table.string('remoteFormName', 1000).nullable();
    })
  );
};

exports.down = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form_rls', (table) => {
      table.dropColumn('nestedPath');
      table.dropColumn('remoteFormId');
      table.dropColumn('remoteFormName');
    })
  );
};
