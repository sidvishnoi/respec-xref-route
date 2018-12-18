#!/usr/bin/env node

// Reads and parses anchor data files from bikeshed-data repository
// and writes data.json containing parsed and formatted data

const { readFileSync, readdirSync, writeFileSync } = require("fs");
const path = require("path");
const fixURI = require("./fix-uri");

const INPUT_DIR = path.resolve("./bikeshed-data/data/anchors/");
const OUT_FILE = path.resolve("./xref-data.json");

const SUPPORTED_TYPES = new Set([
  "attribute",
  "dfn",
  "dict-member",
  "dictionary",
  "element",
  "enum-value",
  "enum",
  "event",
  "interface",
  "method",
  "typedef",
]);

console.log(`Reading files from ${INPUT_DIR}`);
const fileNames = readdirSync(INPUT_DIR);

console.log(`Processing ${fileNames.length} files...`);
const errorURIs = [];
const data = fileNames.reduce((data, fileName) => {
  const file = path.join(INPUT_DIR, fileName);
  const content = readFileSync(file, "utf8");
  try {
    const terms = parseData(content);
    addTermsToData(terms, data);
  } catch (error) {
    console.error(`Error while processing ${fileName}`);
    throw error;
  }
  return data;
}, Object.create(null));

if (errorURIs.length) {
  console.error(
    `[fixURI]: Failed to resolve base url. (x${errorURIs.length})`,
    "Please add base url to spec-urls.txt for the following urls:"
  );
  console.error(errorURIs.join("\n"));
  process.exit(1);
}

console.log(`Writing data file to ${OUT_FILE}`);
writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), "utf8");

/**
 * Parse and format the contents of an anchors file
 * (https://github.com/tabatkins/bikeshed-data/blob/master/data/anchors/)
 *
 * @param {string} content content of an anchors data file
 *
 * The parsing is based on the file format specified at
 * https://github.com/tabatkins/bikeshed/blob/0da7328/bikeshed/update/updateCrossRefs.py#L313-L328
 */
function parseData(content) {
  const re = /\r\n|\n\r|\n|\r/g; // because of Windows!
  const normalizedContent = content.replace(re, "\n");

  const sections = normalizedContent.split("\n-\n").filter(Boolean);

  // format each section to convert data into a usable form
  const termData = sections
    .map(section => section.split("\n"))
    // convert lines (array) to an object for easier access
    .map(lines => {
      const [
        key,
        type,
        spec,
        shortname,
        level,
        status,
        uri,
        isExported,
        normative,
        ..._for
      ] = lines;
      const dataFor = _for.filter(Boolean);
      try {
        const normalizedURI = fixURI(uri);
        if (uri === normalizedURI) {
          errorURIs.push(uri);
        }
        return {
          key,
          isExported: isExported === "1",
          type,
          spec,
          shortname,
          status,
          uri: normalizedURI,
          normative: normative === "1",
          for: dataFor.length > 0 ? dataFor : undefined,
        };
      } catch (error) {
        console.error("Error while processing section:");
        console.error(lines);
        throw error;
      }
    });

  const filtered = termData
    .filter(term => term.isExported && SUPPORTED_TYPES.has(term.type))

  // return unique data
  const unique = new Set(filtered.map(JSON.stringify));
  const result = [...unique].map(JSON.parse);
  return result;
}

function addTermsToData(terms, data) {
  for (const { key, isExported, ...termData } of terms) {
    if (!data[key]) data[key] = [];
    data[key].push(termData);
  }
}
