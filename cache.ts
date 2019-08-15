import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { DATA_DIR, QUERY_CACHE_DURATION } from './constants.js';
import { DataEntry } from './search.js';

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
