#!/usr/bin/env bash
if [ -d "bikeshed-data" ]; then
  cd bikeshed-data
  git pull origin master --depth 1
  cd ..
else
  git clone --depth 1 https://github.com/tabatkins/bikeshed-data.git
fi
