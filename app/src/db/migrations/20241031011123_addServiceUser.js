const { v4: uuidv4 } = require('uuid');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.resolve().then(() => {
    const items = [
      {
        id: uuidv4(),
        createdBy: 'service_account',
        keycloakId: 'fake_keycloakId',
        username: 'service_account',
        email: 'service_account@rls.com',
        firstName: 'Service',
        lastName: 'Account',
        fullName: 'Service Account',
        idpCode: 'idir',
      },
    ];
    return knex('user').insert(items);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function () {
  return Promise.resolve(true);
};
