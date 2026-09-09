'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const { assertPolicyContractInvariants } = require('../../shared/policyContractInvariants.cjs');

const schemaPath = path.resolve(__dirname, '../../contracts/omniseller-r3/v1/policy-contract.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
const validateSchema = ajv.compile(schema);

function validatePolicyContract(contract) {
  const schemaValid = validateSchema(contract);
  const schemaErrors = schemaValid ? [] : (validateSchema.errors || []).map(error => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message,
    params: error.params
  }));
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

module.exports = { schemaPath, validatePolicyContract };
