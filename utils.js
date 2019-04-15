const path = require("path");
const { readFileSync } = require("fs");

class Cache extends Map {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    // placeholder for query (key) id based cache
    this.set("query", new Map());
    // placeholder for "request.options.id" based cache
    this.set("response", new Map());
    // load initial data and cache it
    this.set("by_term", this.readJson("xref.json"));
  }

  readJson(filename) {
    const dataFile = path.resolve(__dirname, `../../data/xref/${filename}`);
    const text = readFileSync(dataFile, "utf8");
    return JSON.parse(text);
  }
}

/** @type {import('.').Cache} */
const cache = new Cache();

module.exports = {
  cache,
};
