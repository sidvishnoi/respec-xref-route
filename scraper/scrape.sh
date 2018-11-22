#!/usr/bin/env bash
rm -rf bikeshed-data
git clone https://github.com/tabatkins/bikeshed-data.git --depth 1
node scraper/scraper.js # writes data.json in cwd
