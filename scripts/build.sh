#!/bin/bash
set -e
rm -rf dist
mkdir -p dist
babel index.js -o dist/index.js --source-maps
babel safeguards -d dist/safeguards --source-maps --ignore "**/*.test.js"
cp -a package.json dist/package.json