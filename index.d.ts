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

export type RequestCache = Map<string, HashCacheEntry>;

export declare class Cache extends Map {
  get<K extends string>(
    key: K,
  ): K extends "request" ? RequestCache : K extends "xref" ? Database : any;
  reset(): void;
}

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
