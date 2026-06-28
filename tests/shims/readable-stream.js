// Shim for readable-stream v2 API using Node.js built-in streams.
// archiver v7 / lazystream v1 expect readable-stream v2 API which v4 removed.
const stream = require('stream');

module.exports = {
  ...stream,
  PassThrough: stream.PassThrough,
  Transform: stream.Transform,
  Readable: stream.Readable,
  Writable: stream.Writable,
  Duplex: stream.Duplex,
  Stream: stream.Stream,
  pipeline: stream.pipeline,
  finished: stream.finished,
};
