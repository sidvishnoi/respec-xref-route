// @ts-check
const { updateDataByTerm } = require('../scraper');
const { objectHash } = require('../utils');

describe.only('scraper', () => {
  test('updateDataByTerm', () => {
    const _terms = {
      'add()': [
        {
          type: 'method',
          spec: 'indexeddb-2',
          shortname: 'indexeddb',
          status: 'current',
          uri: '#dom-idbobjectstore-add',
          for: ['IDBObjectStore'],
        },
        {
          type: 'method',
          spec: 'indexeddb-2',
          shortname: 'indexeddb',
          status: 'current',
          uri: '#dom-idbobjectstore-add',
          for: ['IDBObjectStore'],
        },
        {
          type: 'method',
          spec: 'css-font-loading-3',
          shortname: 'css-font-loading',
          status: 'current',
          uri: '#dom-fontfaceset-add',
          for: ['FontFaceSet'],
        },
      ],
      'add(value)': [
        {
          type: 'method',
          spec: 'indexeddb-2',
          shortname: 'indexeddb',
          status: 'current',
          uri: '#dom-idbobjectstore-add',
          for: ['IDBObjectStore'],
        },
      ],
      'add(value, key)': [
        {
          type: 'method',
          spec: 'indexeddb-2',
          shortname: 'indexeddb',
          status: 'current',
          uri: '#dom-idbobjectstore-add',
          for: ['IDBObjectStore'],
        },
      ],
      'add(font)': [
        {
          type: 'method',
          spec: 'css-font-loading-3',
          shortname: 'css-font-loading',
          status: 'current',
          uri: '#dom-fontfaceset-add',
          for: ['FontFaceSet'],
        },
      ],
    };
    const terms = Object.entries(_terms)
      .map(([key, entries]) =>
        entries.map(entry => ({ _id: objectHash(entry), key, ...entry })),
      )
      .flat(2);

    const dataByTerm = {
      $$data: Object.create(null),
      $$aliases: Object.create(null),
    };
    updateDataByTerm(terms, dataByTerm);

    const expected = {
      $$data: {
        'add(value, key)': [
          {
            type: 'method',
            spec: 'indexeddb-2',
            shortname: 'indexeddb',
            status: 'current',
            uri: '#dom-idbobjectstore-add',
            for: ['IDBObjectStore'],
          },
        ],
        'add(font)': [
          {
            type: 'method',
            spec: 'css-font-loading-3',
            shortname: 'css-font-loading',
            status: 'current',
            uri: '#dom-fontfaceset-add',
            for: ['FontFaceSet'],
          },
        ],
      },
      $$aliases: {
        'add()': ['add(font)', 'add(value, key)'],
        'add(value)': ['add(value, key)'],
      },
    };
    for (const entries of Object.values(expected.$$data)) {
      for (const entry of entries) {
        entry._id = objectHash(entry);
      }
    }

    // expect(dataByTerm.$$data).toEqual(expected.$$data);
    expect(dataByTerm.$$aliases).toEqual(expected.$$aliases);
  });
});
