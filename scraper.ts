// Reads and parses anchor data files from bikeshed-data repository and writes:
// - xref.json containing parsed and formatted data by term
// - specs.json having data by spec shortname
// - specmap.json having spec details

import { promises as fs, existsSync } from 'fs';
import { resolve as resolvePath, join as joinPath } from 'path';
import { spawn } from 'child_process';
import Trie from 'compact-prefix-tree/cjs';
import { SUPPORTED_TYPES, DATA_DIR } from './constants';
import { Data } from './cache';
import { uniq } from './utils';

const { readdir, readFile, writeFile } = fs;

const INPUT_DIR_BASE = joinPath(DATA_DIR, 'bikeshed-data', 'data');
const SPECS_JSON = resolvePath(INPUT_DIR_BASE, './specs.json');
const INPUT_ANCHORS_DIR = resolvePath(INPUT_DIR_BASE, './anchors/');

const OUT_DIR_BASE = joinPath(DATA_DIR, 'xref');
const OUTFILE_BY_TERM = resolvePath(OUT_DIR_BASE, './xref.json');
const OUTFILE_BY_SPEC = resolvePath(OUT_DIR_BASE, './specs.json');
const OUTFILE_SPECMAP = resolvePath(OUT_DIR_BASE, './specmap.json');

type ParsedDataEntry = ReturnType<typeof parseData>[0];

interface DataByTerm {
  [term: string]: Omit<ParsedDataEntry, 'key' | 'isExported'>[];
}
interface DataBySpec {
  [shortname: string]: Omit<ParsedDataEntry, 'shortname' | 'isExported'>[];
}

const log = (...args: any[]) => console.log('(xref/scraper)', ...args);
const logError = (...args: any[]) => console.error('(xref/scraper)', ...args);

export async function main() {
  const hasUpdated = await updateInputSource();
  if (!hasUpdated) {
    log('Nothing to update');
    return false;
  }

  log(`Reading files from ${INPUT_ANCHORS_DIR}`);
  const files = await readdir(INPUT_ANCHORS_DIR);

  log(`Reading ${files.length} files...`);
  const content = await Promise.all(
    files.map(file => readFile(joinPath(INPUT_ANCHORS_DIR, file), 'utf8')),
  );

  const { specMap, urls } = await getSpecsMetadata();

  // We'll use a Trie for an efficient prefix search,
  // to convert long uri to short uri
  // eg: https://html.spec.whatwg.org/multipage/workers.html#abstractworker
  // gets converted to:
  // workers.html#abstractworker
  // as https://html.spec.whatwg.org/multipage/ belongs to `urls`
  const trie = new Trie(urls);

  const dataByTerm: DataByTerm = Object.create(null);
  const dataBySpec: DataBySpec = Object.create(null);
  const errorURIs: string[] = [];
  log(`Processing ${files.length} files...`);
  for (let i = 0; i < files.length; i++) {
    const fileContent = content[i];
    try {
      const terms = parseData(fileContent, errorURIs, trie);
      updateDataByTerm(terms, dataByTerm);
      updateDataBySpec(terms, dataBySpec);
    } catch (error) {
      logError(`Error while processing ${files[i]}`);
      throw error;
    }
  }

  if (errorURIs.length) {
    // ideally never happens. keeping it to prevent database corruption.
    const msg = `[fixURI]: Failed to resolve base url. (x${errorURIs.length})`;
    logError(msg, '\n', errorURIs.join('\n'));
    process.exit(1);
  }

  log('Writing processed data files...');
  await Promise.all([
    writeFile(OUTFILE_BY_TERM, JSON.stringify(dataByTerm, null, 2)),
    writeFile(OUTFILE_BY_SPEC, JSON.stringify(dataBySpec, null, 2)),
    writeFile(OUTFILE_SPECMAP, JSON.stringify(specMap, null, 2)),
  ]);
  return true;
}

function updateInputSource() {
  const shouldClone = !existsSync(INPUT_DIR_BASE);
  const args = shouldClone
    ? ['clone', 'https://github.com/tabatkins/bikeshed-data.git']
    : ['pull', 'origin', 'master'];
  const cwd = shouldClone ? DATA_DIR : INPUT_DIR_BASE;

  return new Promise<boolean>((resolve, reject) => {
    const git = spawn('git', args, { cwd });
    let hasUpdated = true;
    git.stdout.on('data', (data: ArrayBuffer) => {
      hasUpdated = !data.toString().includes('Already up to date');
    });
    git.on('error', reject);
    git.on('exit', (code: number) => {
      if (code !== 0) {
        reject(new Error(`The process exited with code ${code}`));
      } else {
        resolve(hasUpdated);
      }
    });
  });
}

/**
 * Parse and format the contents of an anchors file
 * <https://github.com/tabatkins/bikeshed-data/blob/master/data/anchors/>
 *
 * @param content content of an anchors data file
 * @param errorURIs list of uri where fixUri fails
 * @param trie prefix tree for URL resolution
 *
 * The parsing is based on the file format specified at
 * <https://github.com/tabatkins/bikeshed/blob/0da7328/bikeshed/update/updateCrossRefs.py#L313-L328>
 */
function parseData(content: string, errorURIs: string[], trie: Trie) {
  const re = /\r\n|\n\r|\n|\r/g; // because of Windows!
  const normalizedContent = content.replace(re, '\n');

  const sections = normalizedContent.split('\n-\n').filter(Boolean);

  // format each section to convert data into a usable form
  const termData = sections
    .map(section => section.split('\n'))
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
        ...forContext
      ] = lines;
      const dataFor = forContext.filter(Boolean);
      try {
        const { prefix, isProper } = trie.prefix(uri);
        if (!isProper && !trie.words.has(prefix)) {
          // the second check above is redundant,
          // but serves as an additional safety measure
          errorURIs.push(uri);
        }
        const normalizedURI = uri.replace(prefix, '');
        return {
          key: normalizeKey(key, type),
          isExported: isExported === '1',
          type,
          spec,
          shortname,
          status,
          uri: normalizedURI,
          normative: normative === '1',
          for: dataFor.length > 0 ? dataFor : undefined,
        };
      } catch (error) {
        logError('Error while processing section:');
        logError(lines);
        throw error;
      }
    });

  const filtered = termData.filter(
    term => term.isExported && SUPPORTED_TYPES.has(term.type),
  );

  return uniq(filtered);
}

function updateDataByTerm(terms: ParsedDataEntry[], data: DataByTerm) {
  for (const { key, isExported, ...termData } of terms) {
    if (!data[key]) data[key] = [];
    data[key].push(termData);
  }
}

function updateDataBySpec(terms: ParsedDataEntry[], data: DataBySpec) {
  for (const { shortname, isExported, ...termData } of terms) {
    if (!data[shortname]) data[shortname] = [];
    data[shortname].push(termData);
  }
}

function normalizeKey(key: string, type: string) {
  if (type === 'enum-value') {
    return key.replace(/^"|"$/g, '');
  }
  return key;
}

async function getSpecsMetadata() {
  log(`Getting spec metadata from ${SPECS_JSON}`);

  interface SpecsJSON {
    [specid: string]: {
      current_url: string;
      snapshot_url: string;
      level: number;
      title: string;
      shortname: string;
    };
  }

  const urlFileContent = await readFile(SPECS_JSON, 'utf8');
  const data: SpecsJSON = JSON.parse(urlFileContent);

  const specMap: Data['specmap'] = Object.create(null);
  const specUrls = new Set<string>();

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
