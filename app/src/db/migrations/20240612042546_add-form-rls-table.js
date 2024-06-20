const stamps = require('../stamps');

exports.up = function (knex) {
  return Promise.resolve().then(() =>
    knex.schema.createTable('form_rls', (table) => {
      table.uuid('id').primary();
      table.uuid('userId').references('id').inTable('user').notNullable().index();
      table.uuid('formId').references('id').inTable('form').notNullable().index();
      table.string('field').notNullable();
      table.string('value').notNullable();
      stamps(knex, table);
    })
  );
};

exports.down = function (knex) {
  return Promise.resolve().then(() => knex.schema.dropTableIfExists('form_rls'));
};
