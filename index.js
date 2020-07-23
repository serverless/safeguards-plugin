const runPolicies = require('./safeguards');

class ServerlessSafeguardPlugin {
  constructor(sls) {
    this.sls = sls;
    this.provider = this.sls.getProvider('aws');
    this.state = {};

    this.beforeDeployResources = this.beforeDeployResources.bind(this);

    this.hooks = {
      'before:deploy:deploy': this.beforeDeployResources,
    };
  }

  beforeDeployResources() {
    runPolicies(this);
  }
}

module.exports = ServerlessSafeguardPlugin;
