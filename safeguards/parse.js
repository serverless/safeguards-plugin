'use strict';

const YAML = require('js-yaml');

function parse(ctx, filePath, contents) {
  // Auto-parse JSON
  if (filePath.endsWith('.json')) {
    return JSON.parse(contents);
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    const options = {
      filename: filePath,
    };
    return YAML.load(contents.toString(), options || {});
  }
  throw new ctx.sls.classes.Error(
    `Unrecognized format of "${filePath}". Policies can be provided either via YAML or JSON files`
  );
}

module.exports = parse;
