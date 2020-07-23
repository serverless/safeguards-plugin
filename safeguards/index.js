'use strict';

const { readdir, readFile } = require('fs-extra');
const yml = require('yamljs');
const path = require('path');
const { get, fromPairs, cloneDeep, omit } = require('lodash');
const chalk = require('chalk');

// NOTE: not using path.join because it strips off the leading
const loadPolicy = (policyPath, safeguardName) =>
  require(`${policyPath || './policies'}/${safeguardName}`);

async function runPolicies(ctx) {
  const basePath = ctx.sls.config.servicePath;
  const stage = ctx.provider.options.stage;

  /**
   * Loads all the policy configurations from the custom.safeguards
   * object from serverless.yml.
   */
  const policyConfigs = (get(ctx.sls.service, 'custom.safeguards') || []).map((policy) => {
    const policyConfig = {
      safeguardName: policy.safeguard,
      safeguardConfig: policy.config,
      enforcementLevel: policy.enforcementLevel || 'error',
      title: policy.title || `Policy: ${safeguardName}`,
      description: policy.description,
      stage: policy.stage,
    };

    if (policy.path) {
      let localPoliciesPath = path.relative(__dirname, path.resolve(basePath, policy.path));
      if (!localPoliciesPath.startsWith('.')) {
        localPoliciesPath = `.${path.sep}${localPoliciesPath}`;
      }
      policyConfig.policyPath = localPoliciesPath;
    }

    return policyConfig;
  });

  if (policyConfigs.length === 0) {
    return;
  }

  ctx.sls.cli.log('Safeguards Processing...');

  const policies = policyConfigs.map((policy) => ({
    ...policy,
    function: loadPolicy(policy.policyPath, policy.safeguardName),
  }));

  const service = {
    compiled: {},
    declaration: cloneDeep(omit(ctx.sls.service, ['serverless'])),
    provider: ctx.provider,
    frameworkVersion: ctx.sls.version,
  };

  const artifactsPath = path.join(basePath, '.serverless');
  const artifacts = await readdir(artifactsPath);
  const jsonYamlArtifacts = await Promise.all(
    artifacts
      .filter((filename) => filename.match(/\.(json|yml|yaml)$/i))
      .map(async (filename) => {
        const content = await readFile(path.join(artifactsPath, filename));
        try {
          if (filename.match(/\.json$/i)) {
            return [filename, JSON.parse(content)];
          }
          return [filename, yml.parse(content)];
        } catch (error) {
          ctx.sls.cli.log(
            `(Safeguards) Failed to parse file ${filename} in the artifacts directory.`
          );
          throw error;
        }
      })
  );

  ctx.sls.cli.log(
    `Safeguards Results:

   Summary --------------------------------------------------
`
  );

  service.compiled = fromPairs(jsonYamlArtifacts);
  const runningPolicies = policies.map(async (policy) => {
    process.stdout.write(`  running - ${policy.title}`);

    const result = {
      approved: false,
      failed: false,
      skipped: false,
      policy,
    };
    const approve = () => {
      result.approved = true;
      process.stdout.write(`\r   ${chalk.green('passed')}  - ${policy.title}\n`);
    };
    const fail = (message) => {
      if (result.failed) {
        result.message += ` ${message}`;
      } else {
        const errorWord = policy.enforcementLevel === 'error' ? 'failed' : 'warned';
        const color = policy.enforcementLevel === 'error' ? chalk.red : chalk.keyword('orange');
        process.stdout.write(`\r   ${color(errorWord)}  - ${policy.title}\n`);
        result.failed = true;
        result.message = message;
      }
    };
    const policyHandle = { approve, fail };

    let stageApplies = true;
    if (policy.stage) {
      if (typeof policy.stage === 'string') {
        stageApplies = policy.stage === stage;
      }
      if (typeof policy.stage === 'object' && Array.isArray(policy.stage)) {
        stageApplies = policy.stage.includes(stage);
      }
    }

    if (!stageApplies) {
      result.skipped = true;
      process.stdout.write(`\r   ${chalk.blueBright('skipped')} - ${policy.title}\n`);
    } else {
      await policy.function(policyHandle, service, policy.safeguardConfig);
      if (!result.approved && !result.failed) {
        ctx.sls.cli.log(
          `Safeguard Policy "${policy.title}" finished running, but did not explicitly approve the deployment. This is likely a problem in the policy itself. If this problem persists, contact the policy author.`
        );
      }
    }

    return result;
  });

  ctx.state.safeguardsResults = await Promise.all(runningPolicies);
  const markedPolicies = ctx.state.safeguardsResults.filter((res) => !res.approved && res.failed);

  const failed = markedPolicies.filter((res) => res.policy.enforcementLevel === 'error').length;
  const warned = markedPolicies.filter((res) => res.policy.enforcementLevel !== 'error').length;
  const skipped = ctx.state.safeguardsResults.filter((res) => res.skipped).length;
  const passed = ctx.state.safeguardsResults.filter((res) => res.approved && !res.failed).length;
  const summary = `Safeguards Summary: ${chalk.green(`${passed} passed`)}, ${chalk.keyword(
    'orange'
  )(`${warned} warnings`)}, ${chalk.red(`${failed} errors`)}, ${chalk.blueBright(
    `${skipped} skipped`
  )}`;

  if (markedPolicies.length !== 0) {
    const resolveMessage = (res) => {
      if (!res.failed) return 'Finished inconclusively. Deployment halted.';
      if (res.policy.enforcementLevel === 'error') return chalk.red(`Failed - ${res.message}`);
      return chalk.keyword('orange')(`Warned - ${res.message}`);
    };
    const details = `\n   ${chalk.yellow(
      'Details --------------------------------------------------'
    )}\n\n${markedPolicies
      .map(
        (res, i) =>
          `   ${i + 1}) ${resolveMessage(res)}
      ${chalk.grey(`details: ${res.policy.function.docs}`)}
      ${res.policy.description}`
      )
      .join('\n\n\n')}`;

    process.stdout.write(`${details}\n\n`);
    if (!markedPolicies.every((res) => res.approved || res.policy.enforcementLevel === 'warning')) {
      ctx.sls.cli.log(summary, '\nServerless');
      throw new Error('Deployment blocked by Serverless Safeguards');
    }
  }
  ctx.sls.cli.log(summary, '\nServerless');
}

module.exports = runPolicies;
module.exports.loadPolicy = loadPolicy;
