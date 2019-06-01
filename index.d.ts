export interface DataEntry {
  type: string;
  spec: string;
  shortname: string;
  status: "snapshot" | "current";
  uri: string;
  normative: boolean;
  for?: string[];
}

export interface RequestEntry {
  term: string;
  id?: string;
  types?: string[];
  specs?: string[][];
  for?: string;
}

type Field = "for" | "normative" | "shortname" | "spec"| "type" | "uri";
type Type =
  | "attribute"
  | "dfn"
  | "dict-member"
  | "dictionary"
  | "element"
  | "enum-value"
  | "enum"
  | "event"
  | "interface"
  | "method"
  | "typedef";
export interface Options {
  fields: Field[];
  spec_type: ["draft", "official"];
  types: Type[];
  query?: boolean;
  id?: string;
}

export interface Response {
  result: [string, DataEntry[]][];
  query?: RequestEntry[];
}

export interface CacheEntry {
  query: Map<string, { time: number; value: DataEntry[] }>;
  by_term: { [term: string]: DataEntry[] };
  specmap: {
    [spec: string]: { url: string; shortname: string; title: string };
  };
  response: Map<string, { time: number; value: Response }>;
}

export declare class Cache extends Map {
  get<K extends keyof CacheEntry>(key: K): CacheEntry[K];
  reset(): void;
  autoCleanCaches(): void;
}
