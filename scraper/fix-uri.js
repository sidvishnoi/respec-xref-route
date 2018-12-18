// convert long uri to short uri
// (remove the host part, keep only path)
// eg: https://html.spec.whatwg.org/multipage/workers.html#abstractworker
// gets converted to:
// workers.html#abstractworker
// as https://html.spec.whatwg.org/multipage/ belongs to `spec-urls.txt`

const { readFileSync } = require("fs");
const path = require("path");

const urlListFile = path.resolve(__dirname + "/spec-urls.txt");
const URIs = readFileSync(urlListFile, "utf8")
  .split("\n")
  .filter(Boolean);

// We'll use a Trie for an efficient prefix search
const trie = buildTrie(URIs);

module.exports = function fixURI(uri) {
  if (typeof uri !== "string") {
    throw new TypeError(`Expected "string", but got "${typeof uri}"`);
  }
  let iter = trie;
  let prefixLength = 0;
  for (const ch of uri) {
    ++prefixLength;
    if (iter.children.has(ch)) {
      const node = iter.children.get(ch);
      if (node.isEnd) {
        return uri.substr(prefixLength);
      }
      iter = node;
    } else {
      break;
    }
  }
  return uri;
};

/** @param {string[]} strs */
function buildTrie(strs) {
  class TrieNode {
    /** @param {string} ch */
    constructor(ch) {
      this.ch = ch;
      this.isEnd = false;
      /** @type Map<string, TrieNode> */
      this.children = new Map();
    }
  }

  const rootNode = new TrieNode("@");
  for (const str of strs) {
    let temp = rootNode;
    for (const ch of str) {
      if (!temp.children.has(ch)) {
        const node = new TrieNode(ch);
        temp.children.set(ch, node);
        temp = node;
      } else {
        temp = temp.children.get(ch);
      }
    }
    temp.isEnd = true;
  }
  return rootNode;
}
