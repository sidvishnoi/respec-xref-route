import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import {
  DATA_DIR,
  QUERY_CACHE_DURATION,
  IDL_TYPES,
  CONCEPT_TYPES,
} from './constants.js';

type Type =
  | 'attribute'
  | 'dfn'
  | 'dict-member'
  | 'dictionary'
  | 'element'
  | 'enum-value'
  | 'enum'
  | 'event'
  | 'interface'
  | 'method'
  | 'typedef';

export interface DataEntry {
  type: Type;
  spec: string;
  shortname: string;
  status: 'snapshot' | 'current';
  uri: string;
  normative: boolean;
  for?: string[];
}

type SpecType = DataEntry['status'] | 'draft' | 'official';

export interface Options {
  fields: (keyof DataEntry)[];
  spec_type: SpecType[];
  types: (Type | '_IDL_' | '_CONCEPT_')[];
  query?: boolean;
  id?: string;
  all?: boolean;
}

export interface Query {
  term: string;
  id: string;
  types?: (Type | '_IDL_' | '_CONCEPT_')[];
  specs?: string[][];
  for?: string;
}

interface Response {
  result: [string, Partial<DataEntry>[]][];
  query?: Query[];
}

export interface Data {
  query: Map<string, { time: number; value: DataEntry[] }>;
  by_spec: { [shortname: string]: DataEntry[] };
  by_term: { [term: string]: DataEntry[] };
  specmap: {
    [specid: string]: {
      url: string;
      shortname: string;
      title: string;
    };
  };
}

class Cache extends Map {
  private _version: number;
  constructor() {
    super();
    this._version = 0;
    this.refresh();
  }

  get<T extends keyof Data>(key: T) {
    return super.get(key) as Data[T];
  }

  refresh() {
    this.set('query', new Map() as Data['query']);
    // load initial data and cache it
    this.set('by_term', Cache.readJson<Data['by_term']>('xref.json'));
    this.set('by_spec', Cache.readJson<Data['by_spec']>('specs.json'));
    this.set('specmap', Cache.readJson<Data['specmap']>('specmap.json'));
    this._version++;
  }

  get version() {
    return this._version;
  }

  static readJson<T>(filename: string) {
    const dataFile = resolvePath(DATA_DIR, `./xref/${filename}`);
    const text = readFileSync(dataFile, 'utf8');
    return JSON.parse(text) as T;
  }

  invalidateCaches() {
    const queryCache = this.get('query');
    for (const [key, { time }] of queryCache) {
      if (Date.now() - time > QUERY_CACHE_DURATION) {
        queryCache.delete(key);
      }
    }
  }
}

export const cache = new Cache();

const specStatusAlias = new Map([
  ['draft', 'current'],
  ['official', 'snapshot'],
]);

const defaultOptions: Options = {
  fields: ['shortname', 'type', 'for', 'normative', 'uri'],
  spec_type: ['draft', 'official'],
  types: [],
};

export function search(queries: Query[] = [], opts: Partial<Options> = {}) {
  const data = cache.get('by_term');
  const options = { ...defaultOptions, ...opts };

  const response: Response = { result: [] };
  if (options.query) response.query = [];

  const queryCache = cache.get('query');

  for (const query of queries) {
    if (Array.isArray(query.specs) && !Array.isArray(query.specs[0])) {
      // @ts-ignore
      query.specs = [query.specs]; // for backward compatibility
    }

    const { id = objectHash(query) } = query;
    const termData = getTermData(query, queryCache, data, options);
    const prefereredData = filterBySpecType(termData, options.spec_type);
    const result = prefereredData.map(item => pickFields(item, options.fields));
    response.result.push([id, result]);
    if (options.query) {
      response.query!.push(query.id ? query : { ...query, id });
    }
  }

  return response;
}

function getTermData(
  query: Query,
  cache: Data['query'],
  data: Data['by_term'],
  options: Options,
) {
  const { id, term: inputTerm, types = [] } = query;

  if (cache.has(id)) {
    const { time, value } = cache.get(id)!;
    if (Date.now() - time < QUERY_CACHE_DURATION) {
      return value;
    }
    cache.delete(id);
  }

  const isConcept = types.some(t => CONCEPT_TYPES.has(t));
  const isIDL = types.some(t => IDL_TYPES.has(t));
  const shouldTreatAsConcept = isConcept && (!isIDL && !!types.length);
  let term = shouldTreatAsConcept ? inputTerm.toLowerCase() : inputTerm;
  if (inputTerm === '""') term = '';

  let termData = data[term] || [];
  if (!termData.length && shouldTreatAsConcept) {
    for (const altTerm of textVariations(term)) {
      if (altTerm in data) {
        termData = data[altTerm];
        break;
      }
    }
  }

  const result = termData.filter(item => filter(item, query, options));

  cache.set(id, { time: Date.now(), value: termData });
  return result;
}

function filter(item: DataEntry, query: Query, options: Options) {
  const { specs: specsLists, for: forContext, types } = query;
  let isAcceptable = true;

  if (Array.isArray(specsLists) && specsLists.length) {
    for (const specs of specsLists) {
      isAcceptable = specs.includes(item.shortname);
      if (isAcceptable) break;
    }
  }

  const derivedTypes =
    Array.isArray(types) && types.length ? types : options.types;
  if (isAcceptable && derivedTypes.length) {
    isAcceptable = derivedTypes.includes(item.type);
    if (!isAcceptable) {
      if (derivedTypes.includes('_IDL_')) {
        isAcceptable = IDL_TYPES.has(item.type);
      } else if (derivedTypes.includes('_CONCEPT_')) {
        isAcceptable = CONCEPT_TYPES.has(item.type);
      }
    }
  }

  // if `options.all` is true and `forContext` isn't provided, we skip the this filter
  if (isAcceptable && (options.all ? typeof forContext === 'string' : true)) {
    if (!forContext) {
      isAcceptable = !item.for;
    } else {
      isAcceptable = !!item.for && item.for.includes(forContext);
    }
  }

  return isAcceptable;
}

function filterBySpecType(data: DataEntry[], specTypes: SpecType[]) {
  if (!specTypes.length) return data;

  const preferredType = specStatusAlias.get(specTypes[0]) || specTypes[0];
  const preferredData: DataEntry[] = [];
  data.sort((a, b) =>
    a.status === preferredType ? -1 : b.status === preferredType ? 1 : 0,
  );
  for (const item of data) {
    if (
      item.status === preferredType ||
      !preferredData.find(it => item.spec === it.spec && item.type === it.type)
    ) {
      preferredData.push(item);
    }
  }

  const hasPreferredData = specTypes.length === 2 && preferredData.length;
  return specTypes.length === 1 || hasPreferredData ? preferredData : data;
}

/**
 * Generate intelligent variations of the term
 * Source: https://github.com/tabatkins/bikeshed/blob/682218b6/bikeshed/refs/utils.py#L52 💖
 */
function* textVariations(term: string) {
  const len = term.length;
  const last1 = len >= 1 ? term.slice(-1) : null;
  const last2 = len >= 2 ? term.slice(-2) : null;
  const last3 = len >= 3 ? term.slice(-3) : null;

  // carrot <-> carrots
  if (last1 === 's') yield term.slice(0, -1);
  else yield `${term}s`;

  // snapped <-> snap
  if (last2 === 'ed' && len >= 4 && term.substr(-3, 1) === term.substr(-4, 1)) {
    yield term.slice(0, -3);
  } else if ('bdfgklmnprstvz'.includes(last1 as string)) {
    yield `${term + last1}ed`;
  }

  // zeroed <-> zero
  if (last2 === 'ed') yield term.slice(0, -2);
  else yield `${term}ed`;

  // generated <-> generate
  if (last1 === 'd') yield term.slice(0, -1);
  else yield `${term}d`;

  // parsing <-> parse
  if (last3 === 'ing') {
    yield term.slice(0, -3);
    yield `${term.slice(0, -3)}e`;
  } else if (last1 === 'e') {
    yield `${term.slice(0, -1)}ing`;
  } else {
    yield `${term}ing`;
  }

  // snapping <-> snap
  if (
    last3 === 'ing' &&
    len >= 5 &&
    term.substr(-4, 1) === term.substr(-5, 1)
  ) {
    yield term.slice(0, -4);
  } else if ('bdfgkmnprstvz'.includes(last1 as string)) {
    yield `${term + last1}ing`;
  }

  // zeroes <-> zero
  if (last2 === 'es') yield term.slice(0, -2);
  else yield `${term}es`;

  // berries <-> berry
  if (last3 === 'ies') yield `${term.slice(0, -3)}y`;
  if (last1 === 'y') yield `${term.slice(0, -1)}ies`;

  // stringified <-> stringify
  if (last3 === 'ied') yield `${term.slice(0, -3)}y`;
  if (last1 === 'y') yield `${term.slice(0, -1)}ied`;
}

export function pickFields<T>(item: T, fields: (keyof T)[]) {
  const result: Partial<T> = {};
  for (const field of fields) {
    result[field] = item[field];
  }
  return result;
}

export function objectHash(obj: object): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha1')
    .update(str)
    .digest('hex');
}
