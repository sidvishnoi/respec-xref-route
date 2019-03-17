#!/usr/bin/env node

// Reads and parses anchor data files from bikeshed-data repository
// and writes data.json containing parsed and formatted data

const { readFile, readdirSync, writeFile } = require("fs");
const path = require("path");
const { promisify } = require("util");
const { CompactPrefixTree: Trie } = require("compact-prefix-tree");

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

const SPECS_JSON = path.resolve("./bikeshed-data/data/specs.json");
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

async function main() {
  const urls = await getUrlList();
  // We'll use a Trie for an efficient prefix search,
  // to convert long uri to short uri
  // eg: https://html.spec.whatwg.org/multipage/workers.html#abstractworker
  // gets converted to:
  // workers.html#abstractworker
  // as https://html.spec.whatwg.org/multipage/ belongs to `spec-urls.txt`
  const trie = new Trie(urls);

  console.log(`Reading files from ${INPUT_DIR}`);
  const fileNames = readdirSync(INPUT_DIR);

  console.log(`Reading ${fileNames.length} files...`);
  const contentPromises = fileNames.map(fileName => {
    const file = path.join(INPUT_DIR, fileName);
    return readFileAsync(file, "utf8");
  });
  const content = await Promise.all(contentPromises);

  console.log(`Processing ${fileNames.length} files...`);
  const errorURIs = [];
  const data = fileNames.reduce((data, fileName, i) => {
    try {
      const terms = parseData(content[i], errorURIs, trie);
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
  await writeFileAsync(OUT_FILE, JSON.stringify(data, null, 2), "utf8");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

/**
 * Parse and format the contents of an anchors file
 * (https://github.com/tabatkins/bikeshed-data/blob/master/data/anchors/)
 *
 * @param {string} content content of an anchors data file
 * @param {string[]} errorURIs list of uri where fixUri fails
 * @param {CompactPrefixTree} trie prefix tree for URL resolution
 *
 * The parsing is based on the file format specified at
 * https://github.com/tabatkins/bikeshed/blob/0da7328/bikeshed/update/updateCrossRefs.py#L313-L328
 */
function parseData(content, errorURIs, trie) {
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
        const { prefix, isProper } = trie.prefix(uri);
        if (!isProper && !trie.words.has(prefix)) {
          // the second check above is redundant,
          // but serves as an additional safety measure
          errorURIs.push(uri);
        }
        const normalizedURI = uri.replace(prefix, "");
        return {
          key: normalizeKey(key, type),
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

  const filtered = termData.filter(
    term => term.isExported && SUPPORTED_TYPES.has(term.type)
  );

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

function normalizeKey(key, type) {
  if (type === "enum-value") {
    return key.replace(/^"|"$/g, "");
  }
  return key;
}

async function getUrlList() {
  console.log(`Getting URL list from ${SPECS_JSON}`);
  const urlFileContent = await readFileAsync(SPECS_JSON, "utf8");
  const specsData = JSON.parse(urlFileContent);
  const specUrls = Object.values(specsData).reduce((urls, spec) => {
    if (spec.current_url) urls.add(spec.current_url);
    if (spec.snapshot_url) urls.add(spec.snapshot_url);
    return urls;
  }, new Set());
  return [...specUrls].sort();
}
