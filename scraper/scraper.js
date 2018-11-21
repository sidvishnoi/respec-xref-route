// Reads and parses anchor data files from bikeshed-data repository
// and writes data.json containing parsed and formatted data

const { readFileSync, readdirSync, writeFileSync } = require("fs");
const path = require("path");
const fixURI = require("./fix-uri");

const INPUT_DIR = path.resolve("./bikeshed-data/data/anchors/");
const OUT_FILE = path.resolve("./data.json");

const IDL_TYPES = new Set([
  "attribute",
  "dict-member",
  "dictionary",
  "enum",
  "enum-value",
  "interface",
  "method",
]);
const DFN_TYPES = new Set(["dfn", "event", "element"]);

console.log(`Reading files from ${INPUT_DIR}`);
const fileNames = readdirSync(INPUT_DIR);

const data = fileNames.reduce((data, fileName, i) => {
  process.stdout.write(`\rProcessing: ${i + 1}/${fileNames.length}`);
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

console.log(`\nWriting data file to ${OUT_FILE}`);
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
  const sections = content.split("\n-\n").filter(Boolean);

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
        return {
          key,
          isExported: isExported === "1",
          type,
          spec,
          shortname,
          status,
          uri: fixURI(uri),
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
    .filter(term => term.isExported)
    .filter(term => IDL_TYPES.has(term.type) || DFN_TYPES.has(term.type));

  // return unique data
  return [...new Set(filtered.map(JSON.stringify))].map(JSON.parse);
}

function addTermsToData(terms, data) {
  for (const { key, isExported, ...termData } of terms) {
    if (!data[key]) data[key] = [];
    data[key].push(termData);
  }
}
