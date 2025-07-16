#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { validate } = require('ajv');
const { fetchPricing, checkAccess } = require('../core');

const args = process.argv.slice(2);

if (args[0] === 'validate' && args[1]) {
  const file = args[1];
  const content = fs.readFileSync(file, 'utf8');
  const data = yaml.load(content);
  const schema = require('../schema/pricing.schema.json');
  const Ajv = require('ajv');
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    console.error('Validation errors:', validate.errors);
    process.exit(1);
  } else {
    console.log('✅ pricing.txt is valid.');
    process.exit(0);
  }
} else {
  console.log('Usage: peac validate <path/to/pricing.txt>');
  process.exit(1);
}
