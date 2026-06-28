// Shim for readable-stream/passthrough (v4 removed this subpath).
// Uses Node.js built-in PassThrough stream as a drop-in replacement.
module.exports = require('stream').PassThrough;
