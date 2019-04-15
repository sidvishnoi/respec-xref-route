const path = require("path");
const { readFileSync } = require("fs");

class Cache extends Map {
  constructor() {
    super();
    this.reset();
  }
  reset() {
    // placeholder for id based cache
    this.set("request", new Map());
    // load initial data and cache it
    this.set("xref", this.readJson("xref.json"));
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
