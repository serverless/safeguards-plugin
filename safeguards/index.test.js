'use strict';

const proxyquire = require('proxyquire');
const sinon = require('sinon');
const { cloneDeep } = require('lodash');
const chalk = require('chalk');
const { expect } = require('chai');

let getSafeguardsResolution;
const getSafeguards = async () => getSafeguardsResolution;

const realStdoutWrite = process.stdout.write;

describe('safeguards', () => {
  let runPolicies;
  let loadPolicy;
  let secretsPolicy;
  let requireDlq;
  let iamPolicy;
  before(() => {
    requireDlq = sinon.stub().callsFake((policy) => {
      policy.approve();
    });
    iamPolicy = sinon.stub().callsFake((policy) => {
      policy.approve();
    });
    secretsPolicy = sinon.stub().callsFake((policy) => {
      policy.fail('Error Message');
      policy.fail('Error Message');
    });

    runPolicies = proxyquire('./', {
      '@serverless/platform-sdk': {
        getSafeguards,
        getAccessKeyForTenant: async () => 'access-key',
        urls: { frontendUrl: 'https://dashboard.serverless.com/' },
      },
      'node-dir': {
        readFiles: async () => {},
      },
      'fs-extra': {
        readdir: async () => ['.serverless/cloudformation-template-update-stack.json'],
        readFile: async () => JSON.stringify({ Resources: {} }),
      },
      './policies/require-dlq': requireDlq,
      './policies/no-wild-iam-role-statements': iamPolicy,
      './policies/no-secret-env-vars': secretsPolicy,
    });

    ({ loadPolicy } = runPolicies);
  });

  afterEach(() => {
    process.stdout.write = realStdoutWrite;
  });

  beforeEach(() => {
    process.stdout.write = sinon.spy();
    secretsPolicy.resetHistory();
    secretsPolicy.docs = 'https://git.io/secretDocs';
    requireDlq.resetHistory();
    requireDlq.docs = 'https://git.io/dlqDocs';
    iamPolicy.resetHistory();
    iamPolicy.docs = 'https://git.io/iamDocs';
  });

  describe('safeguards - loadPolicy', () => {
    it('loads a safeguard from inside the plugin', async () => {
      expect(typeof loadPolicy(undefined, 'require-dlq')).to.equal('function');
    });

    it('loads a safeguard from outside the plugin', async () => {
      expect(typeof loadPolicy('../examples/policies', 'no-wild-cors')).to.equal('function');
    });
  });

  describe('safeguards', () => {
    let log;
    const defualtCtx = {
      sls: {
        config: { servicePath: '.' },
        service: {
          custom: {},
        },
        cli: {},
      },
      provider: {
        naming: {},
        options: {
          stage: 'dev',
        },
      },
      state: {},
      safeguards: [],
    };
    beforeEach(() => {
      log = sinon.spy();
      defualtCtx.sls.cli.log = log;
    });

    it('does nothing when there are no safeguards', async () => {
      getSafeguardsResolution = [];
      const ctx = cloneDeep(defualtCtx);
      ctx.sls.service.custom.safeguards = false;
      await runPolicies(ctx);
      expect(log.callCount).to.equal(0);
      expect(process.stdout.write.callCount).to.equal(0);
    });

    it('loads & runs 2 safeguards when specified by remote config', async () => {
      const ctx = cloneDeep(defualtCtx);
      ctx.sls.service.custom.safeguards = [
        {
          title: 'Require Dead Letter Queues',
          safeguard: 'require-dlq',
          enforcementLevel: 'error',
          config: null,
          description: 'You gotta use a DLQ!',
        },
        {
          title: 'no wild iam',
          safeguard: 'no-wild-iam-role-statements',
          enforcementLevel: 'error',
          config: null,
          describe: 'dude! no wild cards in iam roles!',
        },
      ];
      await runPolicies(ctx);
      expect(log.args).to.deep.equal([
        ['Safeguards Processing...'],
        [
          `Safeguards Results:

   Summary --------------------------------------------------
`,
        ],
        [
          `Safeguards Summary: ${chalk.green('2 passed')}, ${chalk.keyword('orange')(
            '0 warnings'
          )}, ${chalk.red('0 errors')}, ${chalk.blueBright('0 skipped')}`,
          '\nServerless',
        ],
      ]);
      expect(process.stdout.write.args).to.deep.equal([
        ['  running - Require Dead Letter Queues'],
        [`\r   ${chalk.green('passed')}  - Require Dead Letter Queues\n`],
        ['  running - no wild iam'],
        [`\r   ${chalk.green('passed')}  - no wild iam\n`],
      ]);
      expect(requireDlq.callCount).to.equal(1);
      expect(iamPolicy.callCount).to.equal(1);
    });

    it('loads & runs 1 warning safeguards at enforcementLevel=warning when specified by remote config', async () => {
      const ctx = cloneDeep(defualtCtx);
      ctx.sls.service.custom.safeguards = [
        {
          title: 'no secrets',
          safeguard: 'no-secret-env-vars',
          enforcementLevel: 'warning',
          config: null,
          description: 'wtf yo? no secrets!',
        },
      ];
      await runPolicies(ctx);
      expect(log.args).to.deep.equal([
        ['Safeguards Processing...'],
        [
          `Safeguards Results:

   Summary --------------------------------------------------
`,
        ],
        [
          `Safeguards Summary: ${chalk.green('0 passed')}, ${chalk.keyword('orange')(
            '1 warnings'
          )}, ${chalk.red('0 errors')}, ${chalk.blueBright('0 skipped')}`,
          '\nServerless',
        ],
      ]);
      expect(process.stdout.write.args).to.deep.equal([
        ['  running - no secrets'],
        [`\r   ${chalk.keyword('orange')('warned')}  - no secrets\n`],
        [
          `\n   ${chalk.yellow('Details --------------------------------------------------')}

   1) ${chalk.keyword('orange')('Warned - Error Message Error Message')}
      ${chalk.grey('details: https://git.io/secretDocs')}
      wtf yo? no secrets!

`,
        ],
      ]);
      expect(secretsPolicy.callCount).to.equal(1);
    });

    it('loads & runs 1 error safeguards at enforcementLevel=error when specified by remote config', async () => {
      const ctx = cloneDeep(defualtCtx);
      ctx.sls.service.custom.safeguards = [
        {
          title: 'no secrets',
          safeguard: 'no-secret-env-vars',
          enforcementLevel: 'error',
          config: null,
          description: 'wtf yo? no secrets!',
        },
      ];
      try {
        await runPolicies(ctx);
        throw new Error('Unexpected');
      } catch (error) {
        expect(error.message).to.include('Deployment blocked by Serverless Safeguards');
      }
      expect(log.args).to.deep.equal([
        ['Safeguards Processing...'],
        [
          `Safeguards Results:

   Summary --------------------------------------------------
`,
        ],
        [
          `Safeguards Summary: ${chalk.green('0 passed')}, ${chalk.keyword('orange')(
            '0 warnings'
          )}, ${chalk.red('1 errors')}, ${chalk.blueBright('0 skipped')}`,
          '\nServerless',
        ],
      ]);
      expect(process.stdout.write.args).to.deep.equal([
        ['  running - no secrets'],
        [`\r   ${chalk.red('failed')}  - no secrets\n`],
        [
          `\n   ${chalk.yellow('Details --------------------------------------------------')}

   1) ${chalk.red('Failed - Error Message Error Message')}
      ${chalk.grey('details: https://git.io/secretDocs')}
      wtf yo? no secrets!

`,
        ],
      ]);
      expect(secretsPolicy.callCount).to.equal(1);
    });
  });
});
