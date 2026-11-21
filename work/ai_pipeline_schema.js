const fs = require('node:fs');
const path = require('node:path');
const roles = new Set(['design', 'implementation', 'gate', 'tests', 'review']);

function schemaFor(role) {
  if (!roles.has(role)) throw Error('Unknown schema');
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../ops/ai-pipeline/schemas', role + '.schema.json'), 'utf8'));
}

function check(schema, value, label) {
  const fail = () => { throw Error('Invalid pipeline record at ' + label); };
  if (schema.enum && !schema.enum.includes(value)) fail();
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== schema.required.length || schema.required.some(k => !Object.hasOwn(value, k))) fail();
    for (const key of schema.required) check(schema.properties[key], value[key], label + '.' + key);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > 250) fail();
    value.forEach((item, i) => check(schema.items, item, label + '[' + i + ']'));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail();
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < 0) fail();
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail();
}

function validate(role, value) {
  check(schemaFor(role), value, role);
  return value;
}

if (require.main === module) console.log(JSON.stringify(schemaFor(process.argv[2])));
module.exports = { schemaFor, validate };
