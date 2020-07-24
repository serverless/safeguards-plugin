'use strict';

const runPolicies = require('./safeguards');
const { getApp, getDeployProfiles } = require('@serverless/platform-sdk');
const chalk = require('chalk');
const yml = require('yamljs');

class ServerlessSafeguardPlugin {
  constructor(sls, options) {
    this.sls = sls;
    this.options = options;
    this.provider = this.sls.getProvider('aws');
    this.state = {};

    this.beforeDeployResources = this.beforeDeployResources.bind(this);
    this.export = this.export.bind(this);

    this.commands = {
      safeguards: {
        commands: {
          export: {
            lifecycleEvents: ['export'],
            usage:
              'Generate @serverless/safeguards-plugin compatible configuration from Serverless Framework Pro Safegurds',
            options: {
              org: {
                usage: 'Specify the org if you do not have an org set in serverless.yml',
                shortcut: 'o',
                required: false,
              },
              app: {
                usage: 'Specify the app if you do not have an app set in the serverless.yml',
                shortcut: 'a',
                required: false,
              },
              service: {
                usage: 'Specify the service if you do not have a service set in the serverless.yml',
                shortcut: 's',
                required: false,
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'before:deploy:deploy': this.beforeDeployResources,
      'safeguards:export:export': this.export,
    };
  }

  beforeDeployResources() {
    runPolicies(this);
  }

  async export() {
    const accessKey = process.env.SERVERLESS_ACCESS_KEY;
    const orgName = this.options.org || this.sls.service.org;
    const appName = this.options.app || this.sls.service.app;
    const exportedSafeguardConfig = [];

    if (!orgName) {
      this.sls.cli.log(
        chalk.red('You must specify an org in your serverless.yml or use the --org option')
      );
      process.exit(-1);
    }
    if (!appName) {
      this.sls.cli.log(
        chalk.red('You must specify an app in your serverless.yml or use the --app option')
      );
      process.exit(-1);
    }
    if (!accessKey) {
      this.sls.cli.log(chalk.red('You must set the SERVERLESS_ACCESS_KEY environment variable'));
      this.sls.cli.log(
        `You can get an access key from https://app.serverless.com/${orgName}/settings/accessKeys`
      );
      process.exit(-1);
    }
    const app = await getApp({
      tenant: orgName,
      token: accessKey,
      app: appName,
    });

    /**
     * The deploymentProfiles object returns {default: ..., stage: {dev:..., prod:... }}
     * object, so this flattens to {default:..., dev:..., prod:...}
     */
    const stageMapping = {
      default: app.deploymentProfiles.default,
      ...app.deploymentProfiles.stages,
    };

    let profiles = [];
    try {
      profiles = await getDeployProfiles({
        accessKey,
        tenant: orgName,
      });
    } catch (err) {
      this.sls.cli.log(chalk.red('Failed to get the deployment profile for unknown reason'));
      this.sls.cli.log(err);
      process.exit(-1);
    }

    profiles.forEach((profile) => {
      //
      /**
       * Identifies the stage from stageMapping based on deploymentProfile.
       * If the profile is not in used in one of the stages in the current
       * app/service, then stage will be undefined.
       */
      const stage = Object.keys(stageMapping).find(
        (profileUid) => stageMapping[profileUid] === profile.deploymentProfileUid
      );

      /**
       * Skip adding the policies from deployment profiles which are not
       * used in any of the stages in the app/service.
       */

      if (stage) {
        profile.safeguardsPolicies.forEach((policy) => {
          const policySetting = {
            title: policy.title,
            description: policy.description,
            safeguard: policy.safeguardName,
            enforcementLevel: policy.enforcementLevel,
            config: policy.safeguardConfig,
          };

          /**
           * If the stage is default, then we skip setting the "stage" property.
           * By not defining the stage, the policy will apply to all stages.
           */
          if (stage !== 'default') {
            policySetting.stage = stage;
          }
          exportedSafeguardConfig.push(policySetting);
        });
      }
    });

    const content = {
      plugins: ['@serverless/safeguards-plugin;'],
      custom: {
        safeguards: exportedSafeguardConfig,
      },
    };

    const generatedYaml = yml.stringify(content, 10, 2);

    this.sls.cli.log(
      chalk.yellow(
        'To migrate safeguards from Serverless Framework Pro dashboard to the @severless/safeguards-plugin:'
      )
    );
    this.sls.cli.log(chalk.yellow('    1. Add the YAML below into your serverless.yml'));
    this.sls.cli.log(chalk.yellow('    2. Delete the safeguards from the deployment profiles'));
    this.sls.cli.log(
      chalk.yellow(
        '    3. If you are not using other SF Pro features, then you can also remove the `org` and `app` fields from serverless.com'
      )
    );
    
    this.sls.cli.log(`\n\n${chalk.reset(generatedYaml)}`);
  }
}

module.exports = ServerlessSafeguardPlugin;
