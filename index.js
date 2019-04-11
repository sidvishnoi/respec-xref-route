// @ts-check
/**
 * @typedef {import('.').Cache} Cache
 * @typedef {import('.').RequestEntry} RequestEntry
 * @typedef {import('.').Database} Database
 * @typedef {import('.').Response} Response
 */
const path = require('path');
const { readFileSync } = require('fs');
const crypto = require('crypto');

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

const CONCEPT_TYPES = new Set(["_CONCEPT_", "dfn", "element", "event"]);

const CACHE_DURATION = 24 * 60 * 60 * 1000;

const specStatusAlias = new Map([
  ["draft", "current"],
  ["official", "snapshot"],
]);

const defaultOptions = {
  fields: ["shortname", "spec", "type", "for", "normative", "uri"],
  spec_type: ["draft", "official"],
  types: [], // any
  query: false,
};

/** @type {Cache} */
const cache = new Map();
cache.set('cache', new Map()); // placeholder for hash based cache
getData('xref', 'xref.json'); // load initial data and cache it

/** @param {RequestEntry[]} keys */
function xrefSearch(keys = [], opts = {}) {
  /** @type {Database} */
  const data = getData('xref', 'xref.json');
  const options = { ...defaultOptions, ...opts };

  /** @type {Response} */
  const response = { result: Object.create(null) };
  if (options.query) response.query = [];

  const termDataCache = cache.get('cache');

  for (const entry of keys) {
    const { hash = objectHash(entry) } = entry;
    const termData = getTermData(entry, data, options);
    if (!termDataCache.has(hash)) {
      termDataCache.set(hash, { time: Date.now(), value: termData });
    }
    const prefereredData = filterBySpecType(termData, options.spec_type);
    const result = prefereredData.map(item => pickFields(item, options.fields));
    response.result[hash] = result;
    if (options.query) {
      response.query.push(entry.hash ? entry : { ...entry, hash });
    }
  }

  return response;
}

/**
 * @param {RequestEntry} entry
 * @param {Database} data
 * @param {typeof defaultOptions} options
 */
function getTermData(entry, data, options) {
  const { hash, term: inputTerm, types } = entry;
  const termDataCache = cache.get('cache');

  if (termDataCache.has(hash)) {
    const { time, value } = termDataCache.get(hash);
    if (Date.now() - time < CACHE_DURATION) {
      return value;
    }
    termDataCache.delete(hash);
  }

  const isIDL = Array.isArray(types) && types.some(t => IDL_TYPES.has(t));
  const term = isIDL ? inputTerm : inputTerm.toLowerCase();

  if (term in data) {
    const termData = data[term].filter(item => filter(item, entry, options));
    return termData;
  }

  return [];
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
  if (!specTypes.length) return data;

  const prefereredType = specStatusAlias.get(specTypes[0]) || specTypes[0];
  const filteredData = data.filter(item => item.status === prefereredType);

  const hasPrefereredData = specTypes.length === 2 && filteredData.length;
  return specTypes.length === 1 || hasPrefereredData ? filteredData : data;
}

function pickFields(item, fields) {
  return fields.reduce((result, field) => {
    result[field] = item[field];
    return result;
  }, {});
}

function getData(key, filename) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const dataFile = path.resolve(__dirname, `../../data/xref/${filename}`);
  const text = readFileSync(dataFile, "utf8");
  const data = JSON.parse(text);
  cache.set(key, data);
  return data;
}

function objectHash(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto
    .createHash('sha1')
    .update(str)
    .digest('hex');
}

module.exports = {
  cache,
  xrefSearch,
};
