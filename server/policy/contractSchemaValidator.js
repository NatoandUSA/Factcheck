'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const { assertPolicyContractInvariants } = require('../../shared/policyContractInvariants.cjs');

const schemaPath = path.resolve(__dirname, '../../contracts/omniseller-r3/v1/policy-contract.schema.json');
const lifecycleSchemaPath = path.resolve(__dirname, '../../contracts/omniseller-r3/v1/policy-lifecycle-event.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const lifecycleSchema = JSON.parse(fs.readFileSync(lifecycleSchemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
function isRfc3339DateTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone, offsetHour, offsetMinute] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) return false;
  if (parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return false;
  if (zone !== 'Z' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}
ajv.addFormat('date-time', {
  type: 'string',
  validate: isRfc3339DateTime
});
const validateSchema = ajv.compile(schema);
const validateLifecycleSchema = ajv.compile(lifecycleSchema);

function errorsOf(validator) {
  return (validator.errors || []).map(error => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message,
    params: error.params
  }));
}

function validatePolicyContract(contract) {
  const schemaValid = validateSchema(contract);
  const schemaErrors = schemaValid ? [] : errorsOf(validateSchema);
  let invariantErrors = [];
  if (schemaValid) {
    try {
      assertPolicyContractInvariants(contract);
    } catch (error) {
      invariantErrors = error.violations || [{ code: error.code || 'POLICY_CONTRACT_INVARIANT_VIOLATION' }];
    }
  }
  return Object.freeze({
    valid: schemaValid && invariantErrors.length === 0,
    schemaErrors: Object.freeze(schemaErrors),
    invariantErrors: Object.freeze(invariantErrors)
  });
}

function validatePolicyLifecycleEvent(event) {
  const valid = validateLifecycleSchema(event);
  return Object.freeze({ valid, schemaErrors: Object.freeze(valid ? [] : errorsOf(validateLifecycleSchema)) });
}

module.exports = { isRfc3339DateTime, lifecycleSchemaPath, schemaPath, validatePolicyContract, validatePolicyLifecycleEvent };
