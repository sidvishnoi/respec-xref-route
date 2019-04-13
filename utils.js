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
    this.getData("xref", "xref.json");
  }

  getData(key, filename) {
    if (this.has(key)) {
      return this.get(key);
    }

    const dataFile = path.resolve(__dirname, `../../data/xref/${filename}`);
    const text = readFileSync(dataFile, "utf8");
    const data = JSON.parse(text);
    this.set(key, data);
    return data;
  }
}

/** @type {import('.').Cache} */
const cache = new Cache();

module.exports = {
  cache,
};
