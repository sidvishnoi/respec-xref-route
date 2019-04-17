// @ts-check
/**
 * @typedef {import('.').RequestEntry} RequestEntry
 * @typedef {import('.').CacheEntry} CacheEntry
 * @typedef {import('.').Response} Response
 * @typedef {import('.').Options} Options
 */
const crypto = require("crypto");
const {
  cache,
  QUERY_CACHE_DURATION,
  RESPONSE_CACHE_DURATION,
} = require("./utils");

const IDL_TYPES = new Set([
  "_IDL_",
  "attribute",
  "dict-member",
  "dictionary",
  "enum-value",
  "enum",
  "exception",
  "interface",
  "method",
  "typedef",
]);

const CONCEPT_TYPES = new Set(["_CONCEPT_", "dfn", "element", "event"]);

const specStatusAlias = new Map([
  ["draft", "current"],
  ["official", "snapshot"],
]);

/** @type {Options} */
const defaultOptions = {
  fields: ["shortname", "type", "for", "normative", "uri"],
  spec_type: ["draft", "official"],
  types: [], // any
};

/** @param {RequestEntry[]} keys */
function xrefSearch(keys = [], opts = {}) {
  const data = cache.get("by_term");
  const options = { ...defaultOptions, ...opts };

  const responseCache = cache.get("response");
  if (options.id && responseCache.has(options.id)) {
    const { time, value: response } = responseCache.get(options.id);
    if (Date.now() - time < RESPONSE_CACHE_DURATION) {
      return response;
    }
  }

  /** @type {Response} */
  const response = { result: [] };
  if (options.query) response.query = [];

  const queryCache = cache.get("query");

  for (const entry of keys) {
    const { id = objectHash(entry) } = entry;
    const termData = getTermData(entry, queryCache, data, options);
    if (!queryCache.has(id)) {
      queryCache.set(id, { time: Date.now(), value: termData });
    }
    const prefereredData = filterBySpecType(termData, options.spec_type);
    const result = prefereredData.map(item => pickFields(item, options.fields));
    response.result.push([id, result]);
    if (options.query) {
      response.query.push(entry.id ? entry : { ...entry, id });
    }
  }

  if (options.id) {
    responseCache.set(options.id, { time: Date.now(), value: response });
  }
  return response;
}

/**
 * @param {RequestEntry} entry
 * @param {CacheEntry["query"]} queryCache
 * @param {CacheEntry["by_term"]} data
 * @param {typeof defaultOptions} options
 */
function getTermData(entry, queryCache, data, options) {
  const { id, term: inputTerm, types } = entry;

  if (queryCache.has(id)) {
    const { time, value } = queryCache.get(id);
    if (Date.now() - time < QUERY_CACHE_DURATION) {
      return value;
    }
    queryCache.delete(id);
  }

  const isIDL = Array.isArray(types) && types.some(t => IDL_TYPES.has(t));
  const term = isIDL ? inputTerm : inputTerm.toLowerCase();

  let termData = data[term] || [];
  if (!termData.length && !isIDL) {
    for (const altTerm of textVariations(term)) {
      if (altTerm in data) {
        termData = data[altTerm];
        break;
      }
    }
  }
  return termData.filter(item => filter(item, entry, options));
}

/**
 * Generate intelligent variations of the term
 * Source: https://github.com/tabatkins/bikeshed/blob/682218b6/bikeshed/refs/utils.py#L52 💖
 * @param {string} term
 */
function* textVariations(term) {
  const len = term.length;
  const last1 = len >= 1 ? term.slice(-1) : null;
  const last2 = len >= 2 ? term.slice(-2) : null;
  const last3 = len >= 3 ? term.slice(-3) : null;

  // carrot <-> carrots
  if (last1 === "s") yield term.slice(0, -1);
  else yield `${term}s`;

  // snapped <-> snap
  if (last2 === "ed" && len >= 4 && term.substr(-3, 1) === term.substr(-4, 1)) {
    yield term.slice(0, -3);
  } else if ("bdfgklmnprstvz".includes(last1)) {
    yield `${term + last1}ed`;
  }

  // zeroed <-> zero
  if (last2 === "ed") yield term.slice(0, -2);
  else yield `${term}ed`;

  // generated <-> generate
  if (last1 === "d") yield term.slice(0, -1);
  else yield `${term}d`;

  // parsing <-> parse
  if (last3 === "ing") {
    yield term.slice(0, -3);
    yield `${term.slice(0, -3)}e`;
  } else if (last1 === "e") {
    yield `${term.slice(0, -1)}ing`;
  } else {
    yield `${term}ing`;
  }

  // snapping <-> snap
  if (last3 === "ing" && len >= 5 && term.substr(-4, 1) === term.substr(-5, 1)) {
    yield term.slice(0, -4);
  } else if ("bdfgkmnprstvz".includes(last1)) {
    yield `${term + last1}ing`;
  }

  // zeroes <-> zero
  if (last2 === "es") yield term.slice(0, -2);
  else yield `${term}es`;

  // berries <-> berry
  if (last3 === "ies") yield `${term.slice(0, -3)}y`;
  if (last1 === "y") yield `${term.slice(0, -1)}ies`;

  // stringified <-> stringify
  if (last3 === "ied") yield `${term.slice(0, -3)}y`;
  if (last1 === "y") yield `${term.slice(0, -1)}ied`;
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

  if (isAcceptable && typeof forContext === "string") {
    if (forContext === "") {
      isAcceptable = !item.for;
    } else {
      isAcceptable = item.for && item.for.includes(forContext);
    }
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

function objectHash(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto
    .createHash("sha1")
    .update(str)
    .digest("hex");
}

module.exports = {
  cache,
  xrefSearch,
};
