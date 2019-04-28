const path = require("path");
const { readFileSync } = require("fs");

const QUERY_CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days
const RESPONSE_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_AUTO_CLEAN_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

class Cache extends Map {
  constructor() {
    super();
    this.reset();
    setInterval(() => this.autoCleanCaches(), CACHE_AUTO_CLEAN_INTERVAL);
  }

  reset() {
    // placeholder for query (key) id based cache
    this.set("query", new Map());
    // placeholder for "request.options.id" based cache
    this.set("response", new Map());
    // load initial data and cache it
    this.set("by_term", this.readJson("xref.json"));
    this.set("by_spec", this.readJson("specs.json"));
    this.set("specmap", this.readJson("specmap.json"));
  }

  readJson(filename) {
    const dataFile = path.resolve(__dirname, `../../data/xref/${filename}`);
    const text = readFileSync(dataFile, "utf8");
    return JSON.parse(text);
  }

  autoCleanCaches() {
    const queryCache = this.get("query");
    for (const [key, { time }] of queryCache) {
      if (Date.now() - time > QUERY_CACHE_DURATION) {
        queryCache.delete(key);
      }
    }
    const responseCache = this.get("response");
    for (const [key, { time }] of responseCache) {
      if (Date.now() - time > RESPONSE_CACHE_DURATION) {
        responseCache.delete(key);
      }
    }
  }
}

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

const SUPPORTED_TYPES = new Set([...IDL_TYPES, ...CONCEPT_TYPES]);

module.exports = {
  Cache,
  QUERY_CACHE_DURATION,
  RESPONSE_CACHE_DURATION,
  IDL_TYPES,
  CONCEPT_TYPES,
  SUPPORTED_TYPES,
};
