const { search: _search } = require('../search');
const data = require('./data');

/**
 * @param {import('../search').Query} query
 * @param {import('../search').Options} options
 */
const search = (query, options) => {
  const { result } = _search([query], {
    fields: ['spec', 'uri', 'type', 'for'],
    ...options,
  });
  return JSON.parse(JSON.stringify(result[0][1]));
};

jest.mock('../cache', () => ({
  cache: {
    get(key) {
      switch (key) {
        case 'by_term':
          return require('./data');
        case 'query':
          return new Map();
        default:
          throw new Error('Invalid cache key');
      }
    },
  },
}));

describe('options', () => {
  describe('query', () => {
    it('adds query back to response if requested', () => {
      expect(_search([], { query: true })).toEqual({ result: [], query: [] });
      expect(_search([])).toEqual({ result: [] });
    });

    it('adds id to query if none is given', () => {
      const getQuery = query => _search([query], { query: true }).query[0];
      expect(getQuery({ term: 'html' })).toEqual({
        term: 'html',
        id: 'e65068091bad3c383def394a09acbebf591b4f58',
      });
      expect(getQuery({ term: 'html', id: 'ID' })).toEqual({
        term: 'html',
        id: 'ID',
      });
    });
  });

  describe('fields', () => {
    const search = (q, opts) => _search([q], { ...opts }).result[0][1];
    const query = { term: 'inherited value', specs: [['css-cascade-3']] };

    it('returns only requested fields', () => {
      expect(search(query, { fields: ['spec', 'uri'] })).toEqual([
        { spec: 'css-cascade-3', uri: '#inherited-value' },
      ]);
    });

    it('returns default fields if not specified', () => {
      expect(search(query)).toEqual([
        {
          spec: 'css-cascade-3',
          uri: '#inherited-value',
          type: 'dfn',
          for: undefined,
          normative: true,
          shortname: 'css-cascade',
        },
      ]);
    });
  });
});

describe('backward compatibility', () => {
  test('allows query.specs as string[]', () => {
    const inputQuery = { specs: ['html'], id: 'ID' };
    const outputQuery = _search([inputQuery], { query: true }).query[0];
    expect(outputQuery).toEqual({ specs: [['html']], id: 'ID' });
  });
});

describe('filter@term', () => {
  test('empty string', () => {
    const result = [
      {
        type: 'enum-value',
        spec: 'referrer-policy-1',
        uri: '#dom-referrerpolicy',
        for: ['ReferrerPolicy'],
      },
    ];
    expect(search({ term: '', for: 'ReferrerPolicy' })).toEqual(result);
    expect(search({ term: '""', for: 'ReferrerPolicy' })).toEqual(result);
    expect(search({ term: "''", for: 'ReferrerPolicy' })).toEqual([]);
  });

  test('textVariations', () => {
    let result = [
      { type: 'dfn', spec: 'html', uri: 'webappapis.html#event-handlers' },
    ];
    expect(search({ term: 'event handler' })).toEqual(result);
    expect(search({ term: 'event handlers' })).toEqual([]);
    expect(search({ term: 'event handlers', types: ['dfn'] })).toEqual(result);

    result = [{ type: 'dfn', spec: 'url', uri: '#concept-host-parser' }];
    expect(search({ term: 'host parsing', types: ['dfn'] })).toEqual(result);
    expect(search({ term: 'host parse', types: ['dfn'] })).toEqual(result);
  });

  it('preserves case based on query.types', () => {
    const baseline = [
      { type: 'dfn', spec: 'svg2', uri: 'text.html#TermBaseline' },
    ];
    const baselineInterface = [
      { type: 'interface', spec: 'font-metrics-api-1', uri: '#baseline' },
    ];

    expect(search({ term: 'baseline' })).toEqual(baseline);
    expect(search({ term: 'baseLine' })).toEqual([]);

    expect(search({ term: 'baseLine', types: ['dfn'] })).toEqual(baseline);
    expect(search({ term: 'baseLine', types: ['_IDL_'] })).toEqual([]);

    expect(search({ term: 'Baseline', types: ['dfn'] })).toEqual(baseline);
    expect(search({ term: 'Baseline', types: ['_IDL_'] })).toEqual(
      baselineInterface,
    );
  });
});

describe('filter@specs', () => {
  it('skips filter if query.specs not provided', () => {
    const results = search({ term: 'script' }).sort((a, b) =>
      a.uri.localeCompare(b.uri),
    );
    const expectedResults = [
      { spec: 'svg2', type: 'element', uri: 'interact.html#elementdef-script' },
      { spec: 'svg', type: 'element', uri: 'script.html#ScriptElement' },
      { spec: 'html', type: 'element', uri: 'scripting.html#script' },
      { spec: 'html', type: 'dfn', uri: 'webappapis.html#concept-script' },
    ].sort((a, b) => a.uri.localeCompare(b.uri));

    expect(results).toEqual(expectedResults);
  });

  it('filters on spec id first, then on shortname', () => {
    expect(
      search({ term: 'inherited value', specs: [['css-cascade-3']] }),
    ).toEqual([
      { spec: 'css-cascade-3', type: 'dfn', uri: '#inherited-value' },
    ]);

    expect(
      search({ term: 'inherited value', specs: [['css-cascade-4']] }),
    ).toEqual([
      { spec: 'css-cascade-4', type: 'dfn', uri: '#inherited-value' },
    ]);

    expect(
      search({ term: 'inherited value', specs: [['css-cascade']] }),
    ).toEqual([
      { spec: 'css-cascade-4', type: 'dfn', uri: '#inherited-value' },
      { spec: 'css-cascade-3', type: 'dfn', uri: '#inherited-value' },
    ]);
  });

  it('supports fallback chains', () => {
    expect(search({ term: 'script', specs: [['dom'], ['svg2']] })).toEqual([
      { spec: 'svg2', type: 'element', uri: 'interact.html#elementdef-script' },
    ]);
  });
});

// TODO remaining
describe('filter@types', () => {});
