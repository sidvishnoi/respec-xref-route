import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { DATA_DIR } from './constants';
import { DataEntry } from './search';

export interface Store {
  version: number;
  bySpec: { [shortname: string]: DataEntry[] };
  byTerm: { [term: string]: DataEntry[] };
  specmap: {
    [specid: string]: {
      url: string;
      shortname: string;
      title: string;
    };
  };
  /** Fill the store with its contents from the filesystem. */
  fill(): void;
}

export const store: Store = {
  version: -1,
  bySpec: {},
  byTerm: {},
  specmap: {},
  fill() {
    this.byTerm = readJson('xref.json');
    this.bySpec = readJson('specs.json');
    this.specmap = readJson('specmap.json');
    this.version = Date.now();
  },
};
store.fill();

function readJson(filename: string) {
  const dataFile = resolvePath(DATA_DIR, `./xref/${filename}`);
  const text = readFileSync(dataFile, 'utf8');
  return JSON.parse(text);
}
