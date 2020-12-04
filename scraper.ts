// Reads and parses definition data files from webref repository and writes:
// - xref.json containing parsed and formatted data by term
// - specs.json having data by spec shortname
// - specmap.json having spec details

import { promises as fs, existsSync } from 'fs';
import { resolve as resolvePath, join as joinPath } from 'path';
import { spawn } from 'child_process';
import { SUPPORTED_TYPES, DATA_DIR, CSS_TYPES_INPUT } from './constants';
import { uniq } from './utils';
import { Store } from './store';
import { Definition as InputDfn, DfnsJSON, SpecsJSON } from 'webref';

const { readFile, writeFile } = fs;

const INPUT_DIR_BASE = joinPath(DATA_DIR, 'webref', 'ed');
const SPECS_JSON = resolvePath(INPUT_DIR_BASE, './index.json');

const OUT_DIR_BASE = joinPath(DATA_DIR, 'xref');
const OUTFILE_BY_TERM = resolvePath(OUT_DIR_BASE, './xref.json');
const OUTFILE_BY_SPEC = resolvePath(OUT_DIR_BASE, './specs.json');
const OUTFILE_SPECMAP = resolvePath(OUT_DIR_BASE, './specmap.json');

type ParsedDataEntry = ReturnType<typeof parseData>[0];

interface DataByTerm {
  [term: string]: Omit<ParsedDataEntry, 'term' | 'isExported'>[];
}
interface DataBySpec {
  [shortname: string]: Omit<ParsedDataEntry, 'shortname' | 'isExported'>[];
}

const log = (...args: any[]) => console.log('(xref/scraper)', ...args);
const logError = (...args: any[]) => console.error('(xref/scraper)', ...args);

const defaultOptions = {
  forceUpdate: false,
};
type Options = typeof defaultOptions;

export async function main(options: Partial<Options> = {}) {
  options = { ...defaultOptions, ...options } as Options;
  const hasUpdated = await updateInputSource();
  if (!hasUpdated && !options.forceUpdate) {
    log('Nothing to update');
    return false;
  }

  const { specMap, dfnSources } = await getAllData();

  const dataByTerm: DataByTerm = Object.create(null);
  const dataBySpec: DataBySpec = Object.create(null);
  log(`Processing ${dfnSources.length} files...`);
  for (const source of dfnSources) {
    try {
      const terms = parseData(source);
      updateDataByTerm(terms, dataByTerm);
      updateDataBySpec(terms, dataBySpec);
    } catch (error) {
      logError(`Error while processing ${source.spec}`);
      throw error;
    }
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
    ? ['clone', 'https://github.com/w3c/webref.git']
    : ['pull', 'origin', 'master'];
  const cwd = shouldClone ? DATA_DIR : INPUT_DIR_BASE;

  return new Promise<boolean>((resolve, reject) => {
    log('Pulling latest changes...');
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
 * Parse and format the contents of webref dfn files
 *
 * @param source content of an dfns data file
 */
function parseData(source: DfnsJSON) {
  const { dfns, spec, series, url } = source;
  const specMetaData = { spec, shortname: series, url };
  const termData = [];
  for (const dfn of dfns) {
    for (const term of dfn.linkingText) {
      const mapped = mapDefinition(dfn, term, specMetaData);
      termData.push(mapped);
    }
  }

  const filtered = termData.filter(
    term => term.isExported && SUPPORTED_TYPES.has(term.type),
  );

  return uniq(filtered);
}

function mapDefinition(
  dfn: InputDfn,
  term: string,
  spec: Record<'spec' | 'shortname' | 'url', string>,
) {
  const normalizedType = CSS_TYPES_INPUT.has(dfn.type)
    ? `css-${dfn.type}`
    : dfn.type;
  return {
    term: normalizeTerm(term, normalizedType),
    isExported: dfn.access === 'public',
    type: normalizedType,
    spec: spec.spec,
    shortname: spec.shortname,
    status: 'current',
    uri: dfn.href.replace(spec.url, ''), // This is full URL to term here
    normative: !dfn.informative,
    for: dfn.for.length > 0 ? dfn.for : undefined,
  };
}

function updateDataByTerm(terms: ParsedDataEntry[], data: DataByTerm) {
  for (const { term, isExported, ...termData } of terms) {
    if (!data[term]) data[term] = [];
    data[term].push(termData);

    if (termData.type === 'method' && /\(.+\)/.test(term)) {
      // add another entry without the arguments
      const methodWithoutArgs = term.replace(/\(.+\)/, '()');
      if (!data[methodWithoutArgs]) data[methodWithoutArgs] = [];
      data[methodWithoutArgs].push(termData);
    }
  }
}

function updateDataBySpec(terms: ParsedDataEntry[], data: DataBySpec) {
  for (const { shortname, isExported, ...termData } of terms) {
    if (!data[shortname]) data[shortname] = [];
    data[shortname].push(termData);
  }
}

function normalizeTerm(term: string, type: string) {
  if (type === 'enum-value') {
    return term.replace(/^"|"$/g, '');
  }
  if (type === 'method' && !term.endsWith(')')) {
    return term + '()';
  }
  return term;
}

async function getAllData() {
  log(`Getting data from ${SPECS_JSON}`);
  const urlFileContent = await readJSON(SPECS_JSON);
  const data: SpecsJSON[] = urlFileContent.results;

  const specMap: Store['specmap'] = Object.create(null);
  const specUrls = new Set<string>();
  const dfnSources: DfnsJSON[] = [];

  for (const entry of data) {
    specUrls.add(entry.nightly.url);
    if (entry.release?.url) specUrls.add(entry.release.url);
    if (entry.dfns) {
      const dfnsData = await readJSON(joinPath(INPUT_DIR_BASE, entry.dfns));
      const dfns: InputDfn[] = dfnsData.dfns;
      dfnSources.push({
        series: entry.series.shortname,
        spec: entry.shortname,
        url: entry.nightly.url,
        dfns,
      });
    }

    specMap[entry.shortname] = {
      url: entry.nightly.url || entry.release?.url || entry.url,
      title: entry.title,
      shortname: entry.shortname,
    };
  }

  return { specMap, dfnSources };
}

async function readJSON(filePath: string) {
  const text = await readFile(filePath, 'utf-8');
  return JSON.parse(text);
}

if (require.main === module) {
  main({ forceUpdate: true }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
