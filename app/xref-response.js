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
    const isIDL = Array.isArray(types)
      && types.length > 0
      && types.some(t => IDL_TYPES.has(t));

    const term = isIDL ? inputTerm : inputTerm.toLowerCase();

    if (!(term in data)) {
      continue;
    }

    let termData = data[term].filter(item => filter(item, entry, options));
    termData = filterBySpecType(termData, options.spec_type);
    termData = termData.map(item => pickFields(item, options.fields));

    if (!response[term]) {
      response[term] = termData;
    } else {
      response[term].push(...termData);
    }
  }

  for (const term in response) {
    if (response[term].length > 0) {
      response[term] = getUnique(response[term]);
    } else {
      delete response[term];
    }
  }

  return response;
}

function filter(item, { specs, types, for: forContext }, options) {
  let isAcceptable = true;

  if (Array.isArray(specs) && specs.length > 0) {
    isAcceptable = specs.includes(item.shortname);
  }

  types = Array.isArray(types) && types.length > 0 ? types : options.types;
  if (isAcceptable && types.length > 0) {
    isAcceptable = types.includes(item.type);
    if (!isAcceptable) {
      if (types.includes("_IDL_")) {
        isAcceptable = IDL_TYPES.has(item.type);
      } else if (types.includes("_CONCEPT_")) {
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
  if (specTypes.length === 0) {
    return data;
  }

  const prefereredType = specStatusAlias.get(specTypes[0]) || specTypes[0];
  const filteredData = data.filter(item => item.status === prefereredType);

  if (
    specTypes.length === 1 ||
    (specTypes.length === 2 && filteredData.length !== 0)
  ) {
    return filteredData;
  }
  return data;
}

function pickFields(item, fields) {
  return fields.reduce((res, field) => (res[field] = item[field], res), {});
}

function getUnique(termData) {
  const unique = new Set(termData.map(JSON.stringify));
  return [...unique].map(JSON.parse);
}

module.exports = xrefResponse;
