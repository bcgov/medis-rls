const { Model } = require('objection');
const { Timestamps } = require('../mixins');
const { Regex } = require('../../constants');
const stamps = require('../jsonSchema').stamps;

class FormRls extends Timestamps(Model) {
  static get tableName() {
    return 'form_rls';
  }

  static get modifiers() {
    return {
      filterFormId(query, value) {
        if (value) {
          query.where('formId', value);
        }
      },
      filterUserId(query, value) {
        if (value) {
          query.where('userId', value);
        }
      },
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['formId'],
      properties: {
        id: { type: 'string', pattern: Regex.UUID },
        userId: { type: 'string', pattern: Regex.UUID },
        formId: { type: 'string', pattern: Regex.UUID },
        field: { type: 'string', maxLength: 255 },
        value: { type: 'string', maxLength: 255 },
        nestedPath: { type: ['string', 'null'], maxLength: 1000 },
        remoteFormId: { type: ['string', 'null'], pattern: Regex.UUID },
        remoteFormName: { type: ['string', 'null'], maxLength: 1000 },
        customViewName: { type: ['string', 'null'], maxLength: 1000 },
        ...stamps,
      },
      additionalProperties: false,
    };
  }
}

module.exports = FormRls;
