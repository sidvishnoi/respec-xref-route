import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { DATA_DIR } from './constants';
import { DataEntry } from './search';

export interface Data {
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

class Store extends Map {
  private _version: number;
  constructor() {
    super();
    this._version = Date.now();
    this.refresh();
  }

  get<T extends keyof Data>(key: T) {
    return super.get(key) as Data[T];
  }

  refresh() {
    // load initial data and cache it
    this.set('by_term', Store.readJson<Data['by_term']>('xref.json'));
    this.set('by_spec', Store.readJson<Data['by_spec']>('specs.json'));
    this.set('specmap', Store.readJson<Data['specmap']>('specmap.json'));
    this._version = Date.now();
  }

  get version() {
    return this._version;
  }

  static readJson<T>(filename: string) {
    const dataFile = resolvePath(DATA_DIR, `./xref/${filename}`);
    const text = readFileSync(dataFile, 'utf8');
    return JSON.parse(text) as T;
  }
}

export const store = new Store();
