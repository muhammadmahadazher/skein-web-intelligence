'use strict';

// Fixed ceiling: caller options cannot disable the stack-exhaustion protection.
const MAX_DEPTH = 128;
const assertDepth = depth => {
  if (depth > MAX_DEPTH) {
    const error = new RangeError(`Brace nesting exceeds safety limit (${MAX_DEPTH})`);
    error.code = 'ERR_BRACES_DEPTH';
    throw error;
  }
};

module.exports = { MAX_DEPTH, assertDepth };
