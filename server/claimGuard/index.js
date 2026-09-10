'use strict';

const taxonomy = require('./taxonomyAdapter');
const lexical = require('./lexicalScanner');
const corroboration = require('./corroboration');
const surfaces = require('./surfacePolicy');
const audit = require('./outputAudit');

module.exports = Object.freeze({ ...taxonomy, ...lexical, ...corroboration, ...surfaces, ...audit });
