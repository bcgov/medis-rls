exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form', (table) => {
      table.string('custom_view_name', 1000).nullable();
    })
  );
};

exports.down = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form', (table) => {
      table.dropColumn('custom_view_name');
    })
  );
};
