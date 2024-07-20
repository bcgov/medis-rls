exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form_rls', (table) => {
      table.string('customViewName', 1000).nullable();
    })
  );
};

exports.down = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form_rls', (table) => {
      table.dropColumn('customViewName');
    })
  );
};
