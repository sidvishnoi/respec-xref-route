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

function xrefResponse({ options, keys }) {
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

    const termData = data[term].filter(item => filter(item, entry));

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

function filter(item, { specs, types, for: forContext }) {
  let isAcceptable = true;

  if (Array.isArray(specs) && specs.length > 0) {
    isAcceptable = specs.includes(item.shortname);
  }

  if (isAcceptable && Array.isArray(types) && types.length > 0) {
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

function getUnique(termData) {
  const unique = new Set(termData.map(JSON.stringify));
  return [...unique].map(JSON.parse);
}

module.exports = xrefResponse;
