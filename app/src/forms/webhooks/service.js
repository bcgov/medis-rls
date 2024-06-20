const { v4: uuidv4 } = require('uuid');

const formService = require('../form/service');

const Problem = require('api-problem');
const {
  Form,
  FormIdentityProvider,
  FormRoleUser,
  FormVersion,
  FormStatusCode,
  FormSubmission,
  FormSubmissionStatus,
  IdentityProvider,
  FileStorage,
  FormSubmissionUser,
  User,
} = require('../common/models');
const { validateScheduleObject } = require('../common/utils');
const { Permissions, Roles, Statuses } = require('../common/constants');
const Rolenames = [Roles.OWNER, Roles.TEAM_MANAGER, Roles.FORM_DESIGNER, Roles.SUBMISSION_REVIEWER, Roles.FORM_SUBMITTER, Roles.SUBMISSION_APPROVER];

const service = {
  checkIfFormExist: async (formId) => {
    const remoteForm = await Form.query().findById(formId);
    return !!remoteForm;
  },

  createFromRemoteForm: async (data, versionNumber, versionId, formSchema) => {
    let trx;
    const scheduleData = validateScheduleObject(data.schedule);
    if (scheduleData.status !== 'success') {
      throw new Problem(422, `${scheduleData.message}`);
    }

    try {
      trx = await Form.startTransaction();
      const obj = {};
      obj.id = data.id;
      obj.name = data.name;
      obj.description = data.description;
      obj.active = true;
      obj.labels = data.labels;
      obj.showSubmissionConfirmation = data.showSubmissionConfirmation;
      obj.sendSubmissionReceivedEmail = data.sendSubmissionReceivedEmail;
      obj.submissionReceivedEmails = data.submissionReceivedEmails;
      obj.enableStatusUpdates = data.enableStatusUpdates;
      obj.enableSubmitterDraft = data.enableSubmitterDraft;
      obj.createdBy = data.usernameIdp;
      obj.allowSubmitterToUploadFile = data.allowSubmitterToUploadFile;
      obj.schedule = data.schedule;
      obj.subscribe = { enable: false };
      obj.reminder_enabled = data.reminder_enabled;
      obj.enableCopyExistingSubmission = data.enableCopyExistingSubmission;
      obj.wideFormLayout = data.wideFormLayout;
      obj.deploymentLevel = data.deploymentLevel;
      obj.ministry = data.ministry;
      obj.apiIntegration = data.apiIntegration;
      obj.useCase = data.useCase;
      obj.remote = true;

      await Form.query(trx).insert(obj);
      if (data.identityProviders && Array.isArray(data.identityProviders) && data.identityProviders.length) {
        const fips = [];
        for (const p of data.identityProviders) {
          const exists = await IdentityProvider.query(trx).where('code', p.code).where('active', true).first();
          if (!exists) {
            throw new Problem(422, `${p.code} is not a valid Identity Provider code`);
          }
          fips.push({ id: uuidv4(), formId: obj.id, code: p.code, createdBy: data.usernameIdp });
        }
        await FormIdentityProvider.query(trx).insert(fips);
      }

      const creatorUser = await User.query(trx).first('username', 'id', 'idpCode');
      // make this user have ALL the roles...
      const userRoles = Rolenames.map((r) => {
        return { id: uuidv4(), createdBy: `${creatorUser.username}@${creatorUser.idpCode}`, userId: creatorUser.id, formId: obj.id, role: r };
      });
      await FormRoleUser.query(trx).insert(userRoles);

      // create a published version
      const version = {
        id: versionId,
        formId: obj.id,
        version: versionNumber,
        createdBy: `${creatorUser.username}@${creatorUser.idpCode}`,
        schema: formSchema,
        published: true,
      };

      // this is where we create change the version data.
      // mark all published as not published.
      await FormVersion.query(trx).patch({ published: false }).where('formId', obj.id);

      // add a record using this schema, mark as published and increment the version number
      await FormVersion.query(trx).insert(version);

      // Map all status codes to the form - hardcoded to include all states
      // TODO: Could make this more dynamic and settable by the user if that feature is required
      const defaultStatuses = Object.values(Statuses).map((status) => ({
        id: uuidv4(),
        formId: obj.id,
        code: status,
        createdBy: `${creatorUser.username}@${creatorUser.idpCode}`,
      }));
      await FormStatusCode.query(trx).insert(defaultStatuses);

      await trx.commit();
      return { formId: obj.id, versionId: versionId };
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },
  createSubmissionFromRemote: async (formVersionId, data, currentUser) => {
    let trx;
    try {
      const formVersion = await formService.readVersion(formVersionId);
      const { identityProviders } = await formService.readForm(formVersion.formId);

      trx = await FormSubmission.startTransaction();

      // Ensure we only record the user if the form is not public facing
      const isPublicForm = identityProviders.some((idp) => idp.code === 'public');
      const createdBy = isPublicForm ? 'public' : data.createdBy;

      const submissionId = data.id;
      const obj = Object.assign(
        {
          id: submissionId,
          formVersionId: formVersion.id,
          confirmationId: submissionId.substring(0, 8).toUpperCase(),
          createdBy: createdBy,
        },
        data
      );

      await FormSubmission.query(trx).insert(obj);

      if (!isPublicForm) {
        // Provide the submission creator appropriate CRUD permissions if this is a non-public form
        // we decided that submitter cannot delete or update their own submission unless it's a draft
        // We know this is the submission creator when we see the SUBMISSION_CREATE permission
        // These are adjusted at the update point if going from draft to submitted, or when adding
        // team submitters to a draft
        const perms = [Permissions.SUBMISSION_CREATE, Permissions.SUBMISSION_READ];
        if (data.draft) {
          perms.push(Permissions.SUBMISSION_DELETE, Permissions.SUBMISSION_UPDATE);
        }

        const itemsToInsert = perms.map((perm) => ({
          id: uuidv4(),
          userId: currentUser.id,
          formSubmissionId: submissionId,
          permission: perm,
          createdBy: createdBy,
        }));

        await FormSubmissionUser.query(trx).insert(itemsToInsert);
      }

      if (!data.draft) {
        // Add a SUBMITTED status if it's not a draft
        const stObj = {
          id: uuidv4(),
          submissionId: submissionId,
          code: Statuses.SUBMITTED,
          createdBy: createdBy,
        };

        await FormSubmissionStatus.query(trx).insert(stObj);
      }

      // does this submission contain any file uploads?
      // if so, we need to update the file storage records.
      // use the schema to determine if there are uploads, fetch the ids from the submission data...
      const fileIds = formService._findFileIds(formVersion.schema, data);
      for (const fileId of fileIds) {
        await FileStorage.query(trx).patchAndFetchById(fileId, { formSubmissionId: obj.id, updatedBy: createdBy });
      }

      await trx.commit();

      return true;
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },
  getUserFromRemote: async (idpUser) => {
    const user = await User.query().modify('filterUsername', idpUser.split('@')[0]).modify('filterIdpCode', idpUser.split('@')[1]).first();
    if (user) {
      return user;
    }
    // if User doesn't exist let's create user placeholder until it logs in with credentials and fill up the rest of the important fields
    let trx;
    try {
      trx = await User.startTransaction();

      const obj = {
        id: uuidv4(),
        idpUserId: '',
        keycloakId: 'TBD',
        username: idpUser.split('@')[0],
        fullName: '',
        email: '',
        firstName: '',
        lastName: '',
        idpCode: idpUser.split('@')[1],
      };

      const result = await User.query(trx).returning('id').insert(obj).onConflict('keycloakId').ignore();
      await trx.commit();
      return result;
    } catch (err) {
      if (trx) await trx.rollback();
      throw err;
    }
  },
};

module.exports = service;
