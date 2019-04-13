export interface DataEntry {
  type: string;
  spec: string;
  shortname: string;
  status: 'snapshot' | 'current';
  uri: string;
  normative: boolean;
  for?: string[];
}

export interface Database {
  [term: string]: DataEntry[];
}

export interface HashCacheEntry {
  time: number;
  value: DataEntry[];
}

export type Cache = Map<'xref', Database> &
  Map<'cache', Map<string, HashCacheEntry>>;

export interface RequestEntry {
  term: string;
  id?: string;
  types?: string[];
  specs?: string[];
  for?: string;
}

export interface Response {
  result: DataEntry[];
  query?: RequestEntry[];
}
