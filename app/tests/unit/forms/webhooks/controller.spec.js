const axios = require('axios');
const { getMockRes } = require('@jest-mock/express');

jest.mock('axios');
jest.mock('config', () => ({ get: (key) => ({ 'server.webhookSecret': 'x-test-webhook-secret' }[key]), has: () => false }));
jest.mock('../../../../src/forms/webhooks/service');
jest.mock('../../../../src/components/log', () => {
  const child = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const getLogger = () => child;
  getLogger.child = child;
  return getLogger;
});

const config = require('config');
const getLogger = require('../../../../src/components/log');
const service = require('../../../../src/forms/webhooks/service');
const controller = require('../../../../src/forms/webhooks/controller');

const log = getLogger.child;
const SECRET_HEADER = config.get('server.webhookSecret');
const FORM_SECRET = 'super-secret-form-key';

const makeReq = (overrides = {}) => ({
  ip: '10.0.0.1',
  get: jest.fn().mockReturnValue(undefined),
  headers: { [SECRET_HEADER]: FORM_SECRET },
  body: { formId: 'form-1', submissionId: 'sub-1', formVersion: 'ver-1', subscriptionEvent: 'eventSubmission' },
  ...overrides,
});

const allLogged = () => JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls]);

describe('webhooks controller logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ status: 200, headers: {}, data: { submission: { createdBy: 'a@idir', draft: false, submission: { data: { f1: 1, f2: 2 } } } } }),
      interceptors: { request: { use: jest.fn() } },
    });
    service.checkIfFormExist.mockResolvedValue(true);
    service.getUserFromRemote.mockResolvedValue({ id: 'user-1' });
    service.createSubmissionFromRemote.mockResolvedValue(true);
  });

  it('logs receipt, the CHEFS fetch and the stored submission without leaking the secret', async () => {
    const { res } = getMockRes();
    await controller.webhooks(makeReq(), res);

    expect(res.status).toBeCalledWith(200);
    const messages = log.info.mock.calls.map((c) => c[0]);
    expect(messages).toEqual(expect.arrayContaining(['Webhook received', 'Webhook fetched submission from CHEFS', 'Webhook stored submission']));
    const fetched = log.info.mock.calls.find((c) => c[0] === 'Webhook fetched submission from CHEFS')[1];
    expect(fetched).toMatchObject({ formId: 'form-1', submissionId: 'sub-1', fieldCount: 2, draft: false });
    expect(allLogged()).not.toContain(FORM_SECRET);
    expect(allLogged()).not.toContain(SECRET_HEADER);
  });

  it('rejects and logs a request without the secret header', async () => {
    const { res } = getMockRes();
    await controller.webhooks(makeReq({ headers: {} }), res);

    expect(res.status).toBeCalledWith(400);
    expect(log.warn).toBeCalledWith('Webhook rejected: secret header missing', expect.objectContaining({ formId: 'form-1' }));
  });

  it('logs incoming header names when the secret header is missing', async () => {
    const { res } = getMockRes();
    await controller.webhooks(makeReq({ headers: { 'content-type': 'application/json', 'x-other': 'v' } }), res);

    expect(log.warn).toBeCalledWith(
      'Webhook rejected: secret header missing',
      expect.objectContaining({
        headerNames: ['content-type', 'x-other'],
        configuredHeaderLength: SECRET_HEADER.length,
        configuredHeaderIsLowercase: true,
        caseInsensitiveMatch: false,
      })
    );
  });

  it('flags a header that matches the secret only by case', async () => {
    const { res } = getMockRes();
    await controller.webhooks(makeReq({ headers: { [SECRET_HEADER.toUpperCase()]: FORM_SECRET } }), res);

    expect(res.status).toBeCalledWith(400);
    expect(log.warn).toBeCalledWith('Webhook rejected: secret header missing', expect.objectContaining({ caseInsensitiveMatch: true }));
  });

  it('returns once when the payload has no formId', async () => {
    const { res } = getMockRes();
    await controller.webhooks(makeReq({ body: { subscriptionEvent: 'eventSubmission' } }), res);

    expect(res.status).toBeCalledTimes(1);
    expect(res.status).toBeCalledWith(400);
    expect(axios.create).not.toBeCalled();
  });

  it('logs ignored event types', async () => {
    const { res } = getMockRes();
    await controller.webhooks(makeReq({ body: { formId: 'form-1', subscriptionEvent: 'eventFormPublished' } }), res);

    expect(res.status).toBeCalledWith(200);
    expect(log.info).toBeCalledWith('Webhook ignored: event type is not handled', expect.objectContaining({ subscriptionEvent: 'eventFormPublished' }));
  });

  it('logs the step that failed', async () => {
    service.createSubmissionFromRemote.mockRejectedValue(new Error('duplicate key'));
    const { res } = getMockRes();
    await controller.webhooks(makeReq(), res);

    expect(res.status).toBeCalledWith(500);
    expect(log.error).toBeCalledWith(
      'Webhook failed at createSubmissionFromRemote: duplicate key',
      expect.objectContaining({ step: 'createSubmissionFromRemote', submissionId: 'sub-1' })
    );
  });
});
