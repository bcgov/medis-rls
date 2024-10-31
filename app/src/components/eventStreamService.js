/* eslint-disable no-console */
const { AckPolicy, JSONCodec } = require('nats');
const Cryptr = require('cryptr');
const falsey = require('falsey');
const config = require('config');
const submissionService = require('../forms/submission/service');
const formService = require('../forms/form/service');
const { SubmissionMetadata, User } = require('../forms/common/models');

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
const DURABLE_NAME = 'pullConsumer';
const ENCRYPTION_KEY = config.get('server.natsEncryptionKey') || undefined;

const proccessRequest = async (m) => {
  // illustrate grabbing the sequence and timestamp from the nats message...
  try {
    const ts = new Date(m.info.timestampNanos / 1000000).toISOString();
    // eslint-disable-next-line no-console
    console.log(`msg seq: ${m.seq}, subject: ${m.subject}, timestamp: ${ts}, streamSequence: ${m.info.streamSequence}, deliverySequence: ${m.info.deliverySequence}`);
    // illustrate (one way of) grabbing message content as json
    const jsonCodec = JSONCodec();
    const data = jsonCodec.decode(m.data);
    try {
      if (data && data['payload'] && data['payload']['data'] && ENCRYPTION_KEY) {
        const cryptr = new Cryptr(ENCRYPTION_KEY);
        const decryptedData = cryptr.decrypt(data['payload']['data']);
        const jsonData = JSON.parse(decryptedData);
        // eslint-disable-next-line no-console
        console.log(jsonData);
        // updating HA hierarchy form
        if (data?.meta?.formMetadata?.rls_form_name === 'ha_hierarchy' && data?.meta?.formMetadata?.rls_form_id) {
          if (jsonData?.submission?.state === 'submitted' && !jsonData?.draft) {
            let query = User.query().modify('filterUsername', 'service_account', true);
            const serviceAccountUser = await query;
            if (serviceAccountUser && serviceAccountUser.length > 0) {
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
              if (data?.meta?.type === 'updated') {
                query = SubmissionMetadata.query().whereRaw(
                  `"formId" = '${data?.meta?.formMetadata?.rls_form_id}' and submission #>> '{data,healthAuthority}' = '${jsonData?.submission?.data?.healthAuthority}'`
                );
                const internalSubmission = await query;
                if (internalSubmission && internalSubmission.length > 0) {
                  if (!jsonData.deleted) {
                    // remove delete prop to make actual submission update
                    delete jsonData.deleted;
                  }
                  submissionService.update(internalSubmission[0]?.submissionId, jsonData, serviceAccountUser[0], null, null, true);
                }
              } else if (data?.meta?.type === 'created') {
                const form = await formService.readForm(data?.meta?.formMetadata?.rls_form_id);
                const formVersion = form.versions.filter((fv) => fv.published === true);
                if (formVersion && formVersion.length > 0) {
                  formService.createSubmission(formVersion[0].id, jsonData, serviceAccountUser[0]);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error decrypting payload.data', err);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Error printing message: ${e.message}`);
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
      console.log(`connect to nats server(s) ${servers} as 'anonymous'...`);
      nc = await natsConnect({
        servers: servers,
        reconnectTimeWait: 10 * 1000, // 10s
      });

      console.log('access jetstream...');
      js = nc.jetstream();
      console.log('get jetstream manager...');
      jsm = await js.jetstreamManager();
      await jsm.consumers.add(STREAM_NAME, {
        ack_policy: AckPolicy.Explicit,
        durable_name: DURABLE_NAME,
      });
      consumer = await js.consumers.get(STREAM_NAME, DURABLE_NAME);
    } catch (e) {
      console.error(e);
      process.exit(0);
    }
  }
};

const pull = async () => {
  console.log('fetch...');
  let iter = await consumer.fetch({
    filterSubjects: FILTER_SUBJECTS,
    max_messages: MAX_MESSAGES,
  });
  for await (const m of iter) {
    proccessRequest(m);
    m.ack();
  }
};

const eventStream = async () => {
  await init();
  await pull();
  setTimeout(eventStream, 5000); // process a batch every 5 seconds
};

const shutdown = async () => {
  console.log('\nshutdown...');
  console.log('drain connection...');
  await nc.drain();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGUSR1', shutdown);
process.on('SIGUSR2', shutdown);
process.on('exit', () => {
  console.log('exit.');
});

module.exports = eventStream;
