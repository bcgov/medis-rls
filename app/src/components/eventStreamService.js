const { AckPolicy, JSONCodec } = require('nats');
const Cryptr = require('cryptr');
const falsey = require('falsey');
const config = require('config');
const submissionService = require('../forms/submission/service');
const formService = require('../forms/form/service');
const { SubmissionMetadata, User } = require('../forms/common/models');
const log = require('./log')(module.filename);
const { describeShape } = require('./logSummary');

/*
 command line pass in environment variables for:
 SERVERS - which nats instance to connect to (default is local from docker-compose)
 WEBSOCKET - connect via nats protocol or websockets. true/false (default false, connect via nats)
 ENCRYPTION_KEY - what encryption key to decrypt (Cryptr - aes-256-gcm) private payloads

 Example:
  SERVERS=ess-a191b5-dev.apps.silver.devops.gov.bc.ca WEBSOCKETS=true ENCRYPTION_KEY=ad5520469720325d1694c87511afda28a0432dd974cb77b5b4b9f946a5af6985 node pullConsumer.js
*/

// different connection libraries if we are using websockerts or nats protocols.
const WEBSOCKETS = !falsey(config.get('server.natsWebsocket'));

let natsConnect;
if (WEBSOCKETS) {
  // shim the websocket library
  globalThis.WebSocket = require('websocket').w3cwebsocket;
  const { connect } = require('nats.ws');
  natsConnect = connect;
} else {
  const { connect } = require('nats');
  natsConnect = connect;
}

// connection info
let servers = [];
if (config.get('server.natsServers')) {
  servers = config.get('server.natsServers').split(',');
} else {
  // running locally
  servers = 'localhost:4222,localhost:4223,localhost:4224'.split(',');
}

let nc = undefined; // nats connection
let js = undefined; // jet stream
let jsm = undefined; // jet stream manager
let consumer = undefined; // pull consumer (ordered, ephemeral)

// stream info
const STREAM_NAME = 'CHEFS';
const FILTER_SUBJECTS = ['PUBLIC.forms.>', 'PRIVATE.forms.>'];
const MAX_MESSAGES = 2;
const DURABLE_NAME = config.get('server.natsDurableName');
const ENCRYPTION_KEY = config.get('server.natsEncryptionKey') || undefined;
const POLL_INTERVAL_MS = 5000;
const SUMMARY_INTERVAL_MS = 60 * 1000;
// Opt in only: decrypted payloads can contain personal information.
const LOG_PAYLOAD = config.has('server.natsLogPayload') && !falsey(config.get('server.natsLogPayload'));

const stats = { polls: 0, emptyPolls: 0, messages: 0, failedPolls: 0, startedAt: Date.now(), lastSummaryAt: Date.now() };

/**
 * Logs the outcome of a change applied in the background. The calls are not
 * awaited by the consumer, so this is where their success or failure is seen.
 */
const track = (promise, description, meta) => {
  Promise.resolve(promise).then(
    () => log.info(`ESS ${description} applied`, meta),
    (err) => log.error(`ESS ${description} failed: ${err?.message}`, { ...meta, error: err?.message })
  );
};

const proccessRequest = async (m) => {
  // illustrate grabbing the sequence and timestamp from the nats message...
  let meta = { seq: m?.seq, subject: m?.subject };
  try {
    const ts = new Date(m.info.timestampNanos / 1000000).toISOString();
    meta = {
      seq: m.seq,
      subject: m.subject,
      streamSequence: m.info.streamSequence,
      deliverySequence: m.info.deliverySequence,
      redeliveryCount: m.info.redeliveryCount,
      published: ts,
      receivedAt: new Date().toISOString(),
      bytes: m.data?.length,
    };
    // illustrate (one way of) grabbing message content as json
    const jsonCodec = JSONCodec();
    const data = jsonCodec.decode(m.data);
    // The envelope (event type and form metadata) is not encrypted. Only the payload data is.
    log.info('ESS message received', {
      ...meta,
      eventType: data?.meta?.type,
      envelopeMeta: data?.meta,
      envelopeShape: describeShape(data, 1),
      hasEncryptedData: Boolean(data?.payload?.data),
    });
    try {
      if (data && data['error']) {
        log.error(`ESS message carries an error. Code: ${data['error']['code']} Message: ${data['error']['message']}`, { ...meta, errorCode: data['error']['code'] });
      } else if (data && data['payload'] && data['payload']['data'] && ENCRYPTION_KEY) {
        const cryptr = new Cryptr(ENCRYPTION_KEY);
        const decryptedData = cryptr.decrypt(data['payload']['data']);
        const jsonData = JSON.parse(decryptedData);
        const formMetadata = data?.meta?.formMetadata;
        const matches = {
          envMatches: formMetadata?.rls_env === config.get('server.natsDurableName'),
          isHaHierarchy: formMetadata?.rls_form_name === 'ha_hierarchy',
          hasFormId: Boolean(formMetadata?.rls_form_id),
        };
        log.info('ESS message decrypted', {
          ...meta,
          eventType: data?.meta?.type,
          formMetadata,
          decryptedBytes: decryptedData.length,
          decryptedShape: describeShape(jsonData, 3),
          submissionId: jsonData?.id,
          submissionDataFields: jsonData?.submission?.data ? Object.keys(jsonData.submission.data) : undefined,
          matches,
        });
        // Full content is only logged when explicitly enabled (NATS_LOG_PAYLOAD=true)
        if (LOG_PAYLOAD) log.info('ESS message payload', { ...meta, payload: jsonData });
        if (matches.envMatches && matches.isHaHierarchy && matches.hasFormId) {
          // updating HA hierarchy form
          let query = User.query().modify('filterUsername', 'service_account', true);
          const serviceAccountUser = await query;
          if (serviceAccountUser && serviceAccountUser.length > 0) {
            // handle cases where HA includes single quotes
            const escapeSQLString = (str) => str.replace(/'/g, "''");
            serviceAccountUser[0].usernameIdp = serviceAccountUser[0].idpCode
              ? `${serviceAccountUser[0].username}@${serviceAccountUser[0].idpCode}`
              : serviceAccountUser[0].username;
            serviceAccountUser[0].public = true;
            // remove some props that comes from CHEFS
            delete jsonData.formVersionId;
            delete jsonData.confirmationId;
            delete jsonData.id;
            delete jsonData.createdBy;
            delete jsonData.createdAt;
            delete jsonData.updatedBy;
            delete jsonData.updatedAt;
            const action = { ...meta, eventType: data?.meta?.type, formId: formMetadata.rls_form_id, healthAuthority: jsonData?.submission?.data?.healthAuthority };
            if (data?.meta?.type === 'updated' || data?.meta?.type === 'deleted') {
              query = SubmissionMetadata.query().whereRaw(
                `"formId" = '${formMetadata.rls_form_id}' and submission #>> '{data,healthAuthority}' = '${escapeSQLString(
                  jsonData?.submission?.data?.healthAuthority
                )}' and deleted != true`
              );
              const internalSubmission = await query;
              if (internalSubmission && internalSubmission.length > 0) {
                const target = { ...action, submissionId: internalSubmission[0]?.submissionId, matchingRecords: internalSubmission.length };
                if (data?.meta?.type === 'deleted') {
                  track(submissionService.delete(internalSubmission[0]?.submissionId, serviceAccountUser[0]), 'delete', target);
                } else {
                  if (!jsonData.deleted) {
                    // remove delete prop to make actual submission update
                    delete jsonData.deleted;
                  }
                  track(submissionService.update(internalSubmission[0]?.submissionId, jsonData, serviceAccountUser[0], null, null, true), 'update', target);
                }
              } else {
                log.warn('ESS no corresponding FORM ID or HA record found', action);
              }
            } else if (data?.meta?.type === 'created') {
              const form = await formService.readForm(formMetadata.rls_form_id);
              const formVersion = form.versions.filter((fv) => fv.published === true);
              if (formVersion && formVersion.length > 0) {
                track(formService.createSubmission(formVersion[0].id, jsonData, serviceAccountUser[0]), 'create', { ...action, formVersionId: formVersion[0].id });
              } else {
                log.warn('ESS create skipped: form has no published version', action);
              }
            } else {
              log.info('ESS message ignored: event type is not handled', action);
            }
          } else {
            log.warn('ESS message skipped: service account user not found', meta);
          }
        } else {
          log.info('ESS message ignored: not an RLS hierarchy event for this environment', { ...meta, eventType: data?.meta?.type, formMetadata, matches });
        }
      } else {
        log.error('Error decrypting payload.data. Either message data or ENCRYPTION_KEY are empty', {
          ...meta,
          hasPayloadData: Boolean(data?.payload?.data),
          hasEncryptionKey: Boolean(ENCRYPTION_KEY),
        });
      }
    } catch (err) {
      log.error(`Error processing ESS message: ${err?.message}`, { ...meta, error: err?.message, stack: err?.stack });
    }
  } catch (e) {
    log.error(`Error reading ESS message: ${e.message}`, { ...meta, error: e.message });
  }
};

const init = async () => {
  if (nc && nc.info != undefined) {
    // already connected.
    return;
  } else {
    // open a connection...
    try {
      // no credentials provided.
      // anonymous connections have read access to the stream
      log.info(`ESS connecting to nats server(s) ${servers} as ${config.get('server.natsUsername')}`, {
        servers,
        websockets: WEBSOCKETS,
        stream: STREAM_NAME,
        durable: DURABLE_NAME,
      });
      nc = await natsConnect({
        servers: servers,
        reconnectTimeWait: 10 * 1000, // 10s
        user: config.get('server.natsUsername'),
        pass: config.get('server.natsPassword'),
      });

      js = nc.jetstream();
      jsm = await js.jetstreamManager();
      await jsm.consumers.add(STREAM_NAME, {
        ack_policy: AckPolicy.Explicit,
        durable_name: DURABLE_NAME,
      });
      consumer = await js.consumers.get(STREAM_NAME, DURABLE_NAME);
      log.info('ESS connected and consumer ready', {
        stream: STREAM_NAME,
        durable: DURABLE_NAME,
        filterSubjects: FILTER_SUBJECTS,
        pollIntervalMs: POLL_INTERVAL_MS,
        maxMessagesPerPoll: MAX_MESSAGES,
        payloadLogging: LOG_PAYLOAD,
      });
    } catch (e) {
      log.error(`ESS connection failed, exiting: ${e?.message}`, { servers, stream: STREAM_NAME, durable: DURABLE_NAME, error: e?.message });
      process.exit(0);
    }
  }
};

const pull = async () => {
  const started = Date.now();
  stats.polls++;
  log.debug('ESS fetching new messages', { poll: stats.polls, polledAt: new Date(started).toISOString() });
  let received = 0;
  const iter = await consumer.fetch({
    filterSubjects: FILTER_SUBJECTS,
    max_messages: MAX_MESSAGES,
  });
  for await (const m of iter) {
    received++;
    proccessRequest(m);
    m.ack();
  }
  stats.messages += received;
  if (received === 0) stats.emptyPolls++;
  // An empty poll is only logged at debug, otherwise this would write a line every few seconds per replica.
  const level = received > 0 ? 'info' : 'debug';
  log.log(level, `ESS poll #${stats.polls} received ${received} message(s)`, {
    poll: stats.polls,
    received,
    polledAt: new Date(started).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  });
};

/** Logs one line summarizing the polling activity since the last summary. */
const logSummary = () => {
  if (Date.now() - stats.lastSummaryAt < SUMMARY_INTERVAL_MS) return;
  log.info('ESS polling summary', {
    ...stats,
    startedAt: new Date(stats.startedAt).toISOString(),
    lastSummaryAt: new Date(stats.lastSummaryAt).toISOString(),
    summaryAt: new Date().toISOString(),
    uptimeMs: Date.now() - stats.startedAt,
    sinceLastSummaryMs: Date.now() - stats.lastSummaryAt,
  });
  stats.lastSummaryAt = Date.now();
};

const eventStream = async () => {
  await init();
  try {
    await pull();
  } catch (e) {
    stats.failedPolls++;
    log.error(`ESS poll failed: ${e?.message}`, { poll: stats.polls, error: e?.message });
  }
  logSummary();
  setTimeout(eventStream, POLL_INTERVAL_MS); // process a batch every 5 seconds
};

const shutdown = async () => {
  log.info('ESS shutdown: draining connection', { ...stats });
  await nc.drain();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGUSR1', shutdown);
process.on('SIGUSR2', shutdown);
process.on('exit', () => {
  log.info('ESS exit.');
});

module.exports = eventStream;
