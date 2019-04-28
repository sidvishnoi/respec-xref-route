#!/usr/bin/env node

// Reads and parses anchor data files from bikeshed-data repository
// and writes data.json containing parsed and formatted data

const { readdir, readFile, writeFile } = require("fs").promises;
const path = require("path");
const { CompactPrefixTree: Trie } = require("compact-prefix-tree");
const { SUPPORTED_TYPES } = require("../utils");

const SPECS_JSON = path.resolve("./data/bikeshed-data/data/specs.json");
const INPUT_DIR = path.resolve("./data/bikeshed-data/data/anchors/");
const OUTFILE_BY_TERM = path.resolve("./data/xref/xref.json");
const OUTFILE_BY_SPEC = path.resolve("./data/xref/specs.json");
const OUTFILE_SPECMAP = path.resolve("./data/xref/specmap.json");

async function main() {
  console.log(`Reading files from ${INPUT_DIR}`);
  const fileNames = await readdir(INPUT_DIR);

  console.log(`Reading ${fileNames.length} files...`);
  const contentPromises = fileNames.map(fileName => {
    const file = path.join(INPUT_DIR, fileName);
    return readFile(file, "utf8");
  });
  const content = await Promise.all(contentPromises);

  const { specMap, urls } = await getSpecsMetadata();

  // We'll use a Trie for an efficient prefix search,
  // to convert long uri to short uri
  // eg: https://html.spec.whatwg.org/multipage/workers.html#abstractworker
  // gets converted to:
  // workers.html#abstractworker
  // as https://html.spec.whatwg.org/multipage/ belongs to `urls`
  const trie = new Trie(urls);

  const dataByTerm = Object.create(null);
  const dataBySpec = Object.create(null);
  const errorURIs = [];
  console.log(`Processing ${fileNames.length} files...`);
  for (const fileContent of content) {
    try {
      const terms = parseData(fileContent, errorURIs, trie);
      updateDataByTerm(terms, dataByTerm);
      updateDataBySpec(terms, dataBySpec);
    } catch (error) {
      console.error(`Error while processing ${fileName}`);
      throw error;
    }
  }

  if (errorURIs.length) {
    // ideally never happens. keeping it to prevent database corruption.
    console.error(
      `[fixURI]: Failed to resolve base url. (x${errorURIs.length})`
    );
    console.error(errorURIs.join("\n"));
    process.exit(1);
  }

  console.log(`Writing by-term data file to ${OUTFILE_BY_TERM}`);
  await writeFile(OUTFILE_BY_TERM, JSON.stringify(dataByTerm, null, 2), "utf8");
  console.log(`Writing by-spec data file to ${OUTFILE_BY_SPEC}`);
  await writeFile(OUTFILE_BY_SPEC, JSON.stringify(dataBySpec, null, 2), "utf8");
  console.log(`Writing spec mapping data to ${OUTFILE_SPECMAP}`);
  await writeFile(OUTFILE_SPECMAP, JSON.stringify(specMap, null, 2), "utf8");
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

function updateDataByTerm(terms, data) {
  for (const { key, isExported, ...termData } of terms) {
    if (!data[key]) data[key] = [];
    data[key].push(termData);
  }
}

function updateDataBySpec(terms, data) {
  for (const { shortname, isExported, ...termData } of terms) {
    if (!data[shortname]) data[shortname] = [];
    data[shortname].push(termData);
  }
}

function normalizeKey(key, type) {
  if (type === "enum-value") {
    return key.replace(/^"|"$/g, "");
  }
  return key;
}

async function getSpecsMetadata() {
  console.log(`Getting spec metadata from ${SPECS_JSON}`);
  const urlFileContent = await readFile(SPECS_JSON, "utf8");
  const data = JSON.parse(urlFileContent);

  const specMap = Object.create(null);
  const specUrls = new Set();

  for (const [spec, entry] of Object.entries(data)) {
    if (entry.current_url) specUrls.add(entry.current_url);
    if (entry.snapshot_url) specUrls.add(entry.snapshot_url);

    specMap[spec] = {
      url: entry.current_url || entry.snapshot_url,
      title: entry.title,
      shortname: entry.shortname,
    };
  }

  const urls = [...specUrls].sort();
  return { urls, specMap };
}
