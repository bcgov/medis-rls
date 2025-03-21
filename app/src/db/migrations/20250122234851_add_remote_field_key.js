/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form_rls', (table) => {
      table.string('remoteFieldKey', 1000).nullable();
    })
  );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.alterTable('form_rls', (table) => {
      table.dropColumn('remoteFieldKey');
    })
  );
};
