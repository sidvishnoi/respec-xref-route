import { resolve } from 'path';

if (!process.env.DATA_DIR) {
  throw new Error('DATA_DIR env variable must be set');
}
export const DATA_DIR = resolve(process.env.DATA_DIR);

export const IDL_TYPES = new Set([
  '_IDL_',
  'attribute',
  'callback',
  'dict-member',
  'dictionary',
  'enum-value',
  'enum',
  'exception',
  'extended-attribute',
  'interface',
  'method',
  'typedef',
]);

export const CONCEPT_TYPES = new Set(['_CONCEPT_', 'dfn', 'element', 'event']);

export const SUPPORTED_TYPES = new Set([...IDL_TYPES, ...CONCEPT_TYPES]);

export const QUERY_CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days
