'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Resolves a file path via realpath and verifies it lives under one of the
 * configured allowedRoots. Throws a 403 error if not.
 */
function assertAllowedPath(filePath) {
  let resolved;
  try {
    resolved = fs.realpathSync(filePath);
  } catch {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }

  const allowed = config.allowedRoots.some(
    root => resolved === root || resolved.startsWith(root + path.sep)
  );

  if (!allowed) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  return resolved;
}

module.exports = { assertAllowedPath };
