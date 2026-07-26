/* eslint-disable @typescript-eslint/no-require-imports */
const core = require("../brace-expansion-core/dist/commonjs/index.js");

module.exports = core.expand;
Object.assign(module.exports, core);
