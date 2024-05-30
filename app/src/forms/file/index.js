const config = require('config');
const setupMount = require('../common/utils').setupMount;
const routes = require('./routes');

const _PATH = config.get('files.uploads.path') || 'files';

const fileUpload = require('./middleware/upload').fileUpload;

fileUpload.init({
  dir: config.has('files.uploads.dir') ? config.get('files.uploads.dir') : undefined,
  fieldName: config.has('files.uploads.fileKey') ? config.get('files.uploads.fileKey') : undefined,
  maxFileCount: config.has('files.uploads.fileCount') ? config.get('files.uploads.fileCount') : undefined,
  maxFileSize: config.has('files.uploads.fileMaxSize') ? config.get('files.uploads.fileMaxSize') : undefined,
});

module.exports.mount = (app) => {
  return setupMount(_PATH, app, routes);
};
