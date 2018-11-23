const data = require("../data.json");

const IDL_TYPES = new Set([
  "_IDL_",
  "attribute",
  "dict-member",
  "dictionary",
  "enum-value",
  "enum",
  "interface",
  "method",
  "typedef",
]);

const CONCEPT_TYPES = new Set([
  "_CONCEPT_",
  "dfn",
  "element",
  "event",
]);

const specStatusAlias = new Map([
  ["draft", "current"],
  ["official", "snapshot"],
]);

const defaultOptions = {
  fields: ["spec", "type", "for", "normative", "uri"],
  spec_type: ["draft", "official"],
  types: [], // any
};

function xrefResponse({ options, keys = [] }) {
  options = { ...defaultOptions, ...options };
  const response = Object.create(null);

  for (const entry of keys) {
    const { term: inputTerm, types } = entry;
    const isIDL = Array.isArray(types) && types.some(t => IDL_TYPES.has(t));

    const term = isIDL ? inputTerm : inputTerm.toLowerCase();

    if (!(term in data)) {
      continue;
    }

    const termData = data[term].filter(item => filter(item, entry, options));
    const prefereredData = filterBySpecType(termData, options.spec_type);
    const result = prefereredData.map(item => pickFields(item, options.fields));

    if (!response[term]) response[term] = [];
    response[term].push(...result);
  }

  for (const term in response) {
    if (response[term].length) {
      response[term] = getUnique(response[term]);
    } else {
      delete response[term];
    }
  }

  return response;
}

function filter(item, entry, options) {
  const { specs, for: forContext, types } = entry;
  let isAcceptable = true;

  if (Array.isArray(specs) && specs.length) {
    isAcceptable = specs.includes(item.shortname);
  }

  const derivedTypes =
    Array.isArray(types) && types.length ? types : options.types;
  if (isAcceptable && derivedTypes.length) {
    isAcceptable = derivedTypes.includes(item.type);
    if (!isAcceptable) {
      if (derivedTypes.includes("_IDL_")) {
        isAcceptable = IDL_TYPES.has(item.type);
      } else if (derivedTypes.includes("_CONCEPT_")) {
        isAcceptable = CONCEPT_TYPES.has(item.type);
      }
    }
  }

  if (isAcceptable && forContext) {
    isAcceptable = item.for && item.for.includes(forContext);
  }

  return isAcceptable;
}

function filterBySpecType(data, specTypes) {
  if (!specTypes.length)  return data;

  const prefereredType = specStatusAlias.get(specTypes[0]) || specTypes[0];
  const filteredData = data.filter(item => item.status === prefereredType);

  const hasPrefereredData = specTypes.length === 2 && filteredData.length;
  return specTypes.length === 1 || hasPrefereredData ? filteredData : data;
}

function pickFields(item, fields) {
  return fields.reduce((res, field) => (res[field] = item[field], res), {});
}

function getUnique(termData) {
  const unique = new Set(termData.map(JSON.stringify));
  return [...unique].map(JSON.parse);
}

module.exports = xrefResponse;
