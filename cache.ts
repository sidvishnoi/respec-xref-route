import { DataEntry } from './search';
import { QUERY_CACHE_DURATION } from './constants';

export const cache = new Map<string, { time: number; value: DataEntry[] }>();

export function invalidateCaches() {
  for (const [key, { time }] of cache) {
    if (Date.now() - time > QUERY_CACHE_DURATION) {
      cache.delete(key);
    }
  }
}
