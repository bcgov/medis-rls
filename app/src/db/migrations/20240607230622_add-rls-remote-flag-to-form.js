exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form', (table) => {
      table.boolean('remote').defaultTo(false).comment('Checks if the form track remote CHEFS form to collect all original submissions');
    })
  );
};

exports.down = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form', (table) => {
      table.dropColumn('remote');
    })
  );
};
