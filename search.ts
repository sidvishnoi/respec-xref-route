import { QUERY_CACHE_DURATION, IDL_TYPES, CONCEPT_TYPES } from './constants';
import { store } from './store';
import { objectHash, pickFields, textVariations, Cache } from './utils';

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

const specStatusAlias = new Map([
  ['draft', 'current'],
  ['official', 'snapshot'],
]);

export const defaultOptions: Options = {
  fields: ['shortname', 'spec', 'type', 'for', 'normative', 'uri'],
  spec_type: ['draft', 'official'],
  types: [],
};

export const cache = new Cache<string, DataEntry[]>(QUERY_CACHE_DURATION);

export function search(queries: Query[] = [], opts: Partial<Options> = {}) {
  const options = { ...defaultOptions, ...opts };

  const response: Response = { result: [] };
  if (options.query) response.query = [];

  for (const query of queries) {
    const result = searchOne(query, options);
    response.result.push([query.id, result]);
    if (options.query) {
      response.query!.push(query);
    }
  }

  return response;
}

export function searchOne(query: Query, options: Options) {
  normalizeQuery(query);
  const termData = getTermData(query, options);
  let prefereredData = filterBySpecType(termData, options.spec_type);
  prefereredData = filterPreferLatestVersion(prefereredData);
  const result = prefereredData.map(item => pickFields(item, options.fields));
  return result;
}

function normalizeQuery(query: Query) {
  if (Array.isArray(query.specs) && !Array.isArray(query.specs[0])) {
    // @ts-ignore
    query.specs = [query.specs]; // for backward compatibility
  }
  if (!query.id) {
    query.id = objectHash(query);
  }
}

function getTermData(query: Query, options: Options) {
  const { id, term: inputTerm, types = [] } = query;

  const cachedValue = cache.get(id);
  if (cachedValue) return cachedValue;

  const isConcept = types.some(t => CONCEPT_TYPES.has(t));
  const isIDL = types.some(t => IDL_TYPES.has(t));
  const shouldTreatAsConcept = isConcept && !isIDL && !!types.length;
  let term = shouldTreatAsConcept ? inputTerm.toLowerCase() : inputTerm;
  if (inputTerm === '""') term = '';

  let termData = store.byTerm[term] || [];
  if (!termData.length && shouldTreatAsConcept) {
    for (const altTerm of textVariations(term)) {
      if (altTerm in store.byTerm) {
        termData = store.byTerm[altTerm];
        break;
      }
    }
  }

  const filteredBySpec = filterBySpec(termData, query);
  const result = filteredBySpec.filter(item => filter(item, query, options));

  cache.set(id, result);
  return result;
}

function filterBySpec(data: DataEntry[], query: Query) {
  const { specs: specsLists } = query;
  if (!Array.isArray(specsLists) || !specsLists.length) return data;
  for (const specs of specsLists) {
    const filteredBySpec = data.filter(
      item => specs.includes(item.spec) || specs.includes(item.shortname),
    );
    if (filteredBySpec.length) return filteredBySpec;
  }
  return [];
}

function filter(item: DataEntry, query: Query, options: Options) {
  const { for: forContext, types } = query;
  let isAcceptable = true;

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
      if (!isAcceptable && CONCEPT_TYPES.has(item.type)) {
        isAcceptable =
          !!item.for && item.for.includes(forContext.toLowerCase());
      }
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

function filterPreferLatestVersion(data: DataEntry[]) {
  if (data.length <= 1) {
    return data;
  }

  const differingByVersion: Record<string, DataEntry[]> = {};
  for (const entry of data) {
    const key = `${entry.shortname}/${entry.uri}`;
    if (!differingByVersion[key]) {
      differingByVersion[key] = [];
    }
    differingByVersion[key].push(entry);
  }

  const result: DataEntry[] = [];
  for (const entries of Object.values(differingByVersion)) {
    if (entries.length > 1) {
      // sorted as largest version number (latest) first
      entries.sort((a, b) => getVersion(b.spec) - getVersion(a.spec));
    }
    result.push(entries[0]);
  }
  return result;
}

function getVersion(s: string) {
  const match = s.match(/(\d+)?$/);
  return match ? Number(match[1]) : 0;
}
