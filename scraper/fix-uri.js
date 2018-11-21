// convert long uri to short uri
// (remove the host part, keep only path)
// eg: https://html.spec.whatwg.org/multipage/workers.html#abstractworker
// gets converted to:
// workers.html#abstractworker
// as https://html.spec.whatwg.org/multipage/ belongs to `spec-urls.txt`
//
// We'll use a Trie for an efficient prefix search
const { readFileSync } = require("fs");
const path = require("path");

const URIs = new Set(
  readFileSync(path.resolve("./scraper/spec-urls.txt"), "utf8")
    .split("\n")
    .filter(Boolean),
);

const trie = buildTrie(URIs);

let warningCount = 0;
module.exports = function fixURI(uri) {
  if (typeof uri !== "string") {
    throw new TypeError(`Expected "string", but got "${typeof uri}"`);
  }
  let temp = trie;
  let prefixLength = 0;
  for (const ch of uri) {
    ++prefixLength;
    const node = temp.children[ch];
    if (node !== undefined) {
      if (node.isEnd) {
        return uri.substr(prefixLength);
      }
      temp = node;
    } else {
      break;
    }
  }
  console.warn(
    `(fixURI#${++warningCount}): Cannot resolve url: ${uri}. ` +
      "Please add a base url to spec-urls.txt",
  );
  return uri;
};

function buildTrie(strs) {
  class TrieNode {
    constructor(ch) {
      this.ch = ch;
      this.isEnd = false;
      this.children = Object.create(null);
    }
  }

  const rootNode = new TrieNode("@");
  for (const str of strs) {
    let temp = rootNode;
    for (const ch of str) {
      let node = temp.children[ch];
      if (node === undefined) {
        node = new TrieNode(ch);
        temp.children[ch] = node;
      }
      temp = node;
    }
    temp.isEnd = true;
  }
  return rootNode;
}
