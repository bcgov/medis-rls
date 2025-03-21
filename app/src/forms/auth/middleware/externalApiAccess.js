const Problem = require('api-problem');
const { validate: uuidValidate } = require('uuid');
const config = require('config');
const crypto = require('crypto');

const formService = require('../../form/service');
const submissionService = require('../../submission/service');
const fileService = require('../../file/service');

const HTTP_401_DETAIL = 'Invalid authorization credentials.';
const HTTP_403_DETAIL = 'You do not have access to this resource.';

/**
 * Gets the Form ID from the request parameters. Handles the cases where instead
 * of an explicit Form ID, the parameters include something like a Submission ID
 * that then has to be used to find the Form ID.
 *
 * @param {*} params the request parameters.
 * @returns a UUID for form that the requested data belongs to.
 * @throws Problem if there is a UUID validation error.
 */
const _getFormId = async (params) => {
  let formId;
  if (params.formId) {
    formId = params.formId;

    if (!uuidValidate(formId)) {
      throw new Problem(400, { detail: `Bad formId "${formId}".` });
    }
  } else if (params.formSubmissionId) {
    formId = await _getFormIdFromSubmissionId(params.formSubmissionId);
  } else if (params.id) {
    formId = await _getFormIdFromFileId(params.id);
  }

  return formId;
};

/**
 * Gets the Form ID that corresponds to a given File ID.
 *
 * @param uuid fileId that has a corresponding Form ID.
 * @returns a UUID for form that the File ID belongs to.
 * @throws Problem if there is a UUID validation error.
 */
const _getFormIdFromFileId = async (fileId) => {
  if (!uuidValidate(fileId)) {
    throw new Problem(400, { detail: `Bad fileId "${fileId}".` });
  }

  // check for file id (saved as id), get submissionID from request body
  const file = await fileService.read(fileId);

  // check to see that an associated submissionId exists
  if (file && !file.formSubmissionId) {
    throw new Problem(500, { detail: `Submission ID missing in file storage "${fileId}".` });
  }

  return _getFormIdFromSubmissionId(file.formSubmissionId);
};

/**
 * Gets the Form ID that corresponds to a given Submission ID.
 *
 * @param uuid formSubmissionId that has a corresponding Form ID.
 * @returns a UUID for form that the Submission ID belongs to.
 * @throws Problem if there is a UUID validation error.
 */
const _getFormIdFromSubmissionId = async (formSubmissionId) => {
  if (!uuidValidate(formSubmissionId)) {
    throw new Problem(400, { detail: `Bad formSubmissionId "${formSubmissionId}".` });
  }

  const result = await submissionService.read(formSubmissionId);

  return result?.form?.id;
};

module.exports = async (req, res, next) => {
  try {
    // Check if authorization header is basic auth
    if (req.headers && req.headers.apikey) {
      // URL params should override query string params of the same attribute
      const params = { ...req.query, ...req.params };

      // Get the form ID using whatever parameter we have in the request (Form
      // ID, Form Submission ID, or File Upload ID).
      const formId = await _getFormId(params);
      if (!formId) {
        throw new Problem(401, { detail: HTTP_401_DETAIL });
      }

      const apiKey = await formService.readApiKey(formId);
      if (!apiKey || !apiKey.secret) {
        throw new Problem(401, { detail: HTTP_401_DETAIL });
      }

      if (params.id && apiKey.filesApiAccess === false) {
        throw new Problem(403, { detail: HTTP_403_DETAIL });
      }

      const apikeyEnv = config.get('server.externalApiKey');

      const secret = apiKey.secret;

      const userInputSecret = req.headers.apikey.split(':')[1];
      const userInputApiKey = req.headers.apikey.split(':')[0];
      if (crypto.timingSafeEqual(Buffer.from(userInputSecret), Buffer.from(secret)) && crypto.timingSafeEqual(Buffer.from(userInputApiKey), Buffer.from(apikeyEnv))) {
        return next();
      } else {
        throw new Problem(401, { detail: HTTP_401_DETAIL });
      }
    } else {
      throw new Problem(401, { detail: HTTP_401_DETAIL });
    }
  } catch (error) {
    next(error);
  }
};
