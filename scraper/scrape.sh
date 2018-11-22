#!/usr/bin/env bash
if [ -d "bikeshed-data" ]; then
  cd bikeshed-data
  git pull origin master
  cd ..
else
  git clone https://github.com/tabatkins/bikeshed-data.git
fi
node scraper/scraper.js # writes data.json in cwd
