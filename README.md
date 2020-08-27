# Safeguards

**Safeguards** is a policy-as-code framework for Serverless Framework which enables you to inspect your `serverless.yml` file, and the generated Cloud Formation templates, for compliance with security, operational, and organizational, best practices. Safeguards are made available as a stand-alone Serverless Framework plugin with no external dependencies.

### Highlights

- **Stand-alone** - it has no external dependencies on any services.
- **Extensible** - While the plugin comes with over a dozen policies out of the box, you can define new Safeguards and add them to your repo.
- **Configurable** - Safeguards are implemented to accept configuration as input so you can customize the policies for each safeguard.
- **Proactive** - Safeguards are evaluated _before_ any infrastructure is provisioned by evaluating the generated cloud formation template and serverless.yml.
- **Environment-specific** - Policies can be associated with stages you can enforce different policies on development environments and production environments.
- **Independent** - While policies will get run when you deploy, you can run and validate the policies as a standalone without deploying.

## Docs

- [Installation](#installation)
- [Defining policies](#defining-policies)
- [Usage](#usage)
- [Example](#example)
- [Migrating from Serverless Framework Pro](#migrating-from-serverless-framework-pro)
- [Available Safeguards](#safeguards-available-with-plugin)
- [Custom policies](#custom-policies)

## Installation

To install **automatically** run this single command:

```
serverless plugin install --name @serverless/safeguards-plugin
```

To install **manually**, run this command,

`npm i @serverless/safeguards-plugin --save-dev`

and add this to your `serverless.yml`:

```yaml
plugins:
  - '@serverless/safeguards-plugin'
```

## Defining Policies

Safeguard policies are defined as an array in the `serverless.yml` in the `custom.safeguards` field. You can add multiple policies, and you can use the same safeguard multiple times.

```yaml
custom:
  safeguards:
    - safeguard:
      title:
      description:
      enforcementLevel:
      config:
      stage:
```

### Fields

#### `title` (optional)

This is a user-readable name for the Safeguard policy. When the policy check is run in the CLI, the Safeguard policy name is used in the output.

#### `description` (optional)

The description should explain the intent of the policy. When the Safeguard policy check runs in the CLI this description will be displayed if the policy check fails. It is recommended that the description provides instructions on how to resolve an issue if the service is not compliant with the policy.

#### `safeguard` (required)

The Safeguard ID. There are [over a dozen safeguards made availabe with the plugin](#safeguards-available-with-plugin). Each plugin has an `ID` (e.g. `allowed-runtimes`) which is used to reference in the policy.

#### `enforcementLevel` (optional, default: `error`)

The enforcement level can be set to either `warning` or `error`. When the Safeguard policy check runs in the CLI and the policy check passes, then enforcement level will have no impact on the deployment. However, if the policy check fails, then the enforcement level will control if the deployment can continue. If the enforcement level is set to `warning`, then the CLI will return a warning message but the deployment will continue. If the enforcement level is set to `error`, then the CLI will return an error message and the deployment will be blocked from continuing.

#### `config`

Some safeguards may allow or require configurations. For example, the [Allowed Runtimes (allowed-runtimes)](#allowed-runtimes) Safeguard requires a list of allowed AWS Lambda Runtimes for functions. This field allows you to customize the settings for the Safeguard policy.

#### `path` (optional)

If using a custom policy, this references the relative path to the safeguard base directory.

#### `stage` (optional)

By default a policy will run on all deployments, regardless of stage. However, if you want to scope the policy to only certain stages (e.g. `prod`), you can enforce the policy only on the selected stages. The stage field accepts string, or an array of strings, and if the current stage matches any of those, then the policy will be enforced.

## Usage

The policy checks are performed as a part of the `serverless deploy` command.
This will load the safeguard settings from the `serverless.yml` file to
determine which policies to evaluate.

In addition, you can simply validate the configuration without doing a deploy.

**Example deploy**

```
$ sls deploy
...
Serverless: Safeguards Results:

   Summary --------------------------------------------------

   passed - require-dlq
   passed - allowed-runtimes
   passed - no-secret-env-vars
   passed - allowed-stages
   failed - require-cfn-role
   passed - allowed-regions
   passed - framework-version
   failed - no-wild-iam-role-statements

   Details --------------------------------------------------

   1) Failed - no cfnRole set
      details: https://git.io/fhpFZ
      Require the cfnRole option, which specifies a particular role for CloudFormation to assume while deploying.


   2) Failed - iamRoleStatement granting Resource='*'. Wildcard resources in iamRoleStatements are not permitted.
      details: https://git.io/fjfk7
      Prevent "*" permissions being used in AWS IAM Roles by checking for wildcards on Actions and Resources in grant statements.


Serverless: Safeguards Summary: 6 passed, 0 warnings, 2 errors
...
```

**Example standalone validate**

```
$ sls safeguards validate
...
Serverless: Safeguards Results:

   Summary --------------------------------------------------

   passed - require-dlq
   passed - allowed-runtimes
   passed - no-secret-env-vars
   passed - allowed-stages
   failed - require-cfn-role
   passed - allowed-regions
   passed - framework-version
   failed - no-wild-iam-role-statements

   Details --------------------------------------------------

   1) Failed - no cfnRole set
      details: https://git.io/fhpFZ
      Require the cfnRole option, which specifies a particular role for CloudFormation to assume while deploying.


   2) Failed - iamRoleStatement granting Resource='*'. Wildcard resources in iamRoleStatements are not permitted.
      details: https://git.io/fjfk7
      Prevent "*" permissions being used in AWS IAM Roles by checking for wildcards on Actions and Resources in grant statements.


Serverless: Safeguards Summary: 6 passed, 0 warnings, 2 errors
```

### Policy check results

When a policy check is performed, the policy can respond with a **pass**,
**fail** or **warning**. A fail will block and prevent the deploy from
occurring. A warning will display a message but the deploy will continue.

If one or more of the policy checks fail the command will return a 1 exit code so
it can be detected from a script or CI/CD service.

## Example

```yaml
service: aws-node-rest-api

provider:
  name: aws
  runtime: nodejs12.x
  region: us-east-1

functions:
  hello:
    handler: handler.hello

plugins:
  - @serverless/safeguards-plugin

custom:
  safeguards:
    - title: No secrets in lambda ENV VARs
      safeguard: no-secret-env-vars

    - title: Restrict regions
      safeguard: allowed-regions
      description: Only deployments in US regions are allowed
      enforcementLevel: error # if this policy fails, then BLOCK the deployment
      config: # this configures the allowed-regions safeguard
        - us-east-1
        - us-east-2
        - us-west-1
        - us-west-2
      stage: # this policy will only be enforced if you deploy to prod or qa
        - prod
        - qa
```

## Migrating from Serverless Framework Pro

Serverless Framework Pro safeguards have been open source and repackaged in this plugin. Here is how you can migrate your existing configuration in SF Pro to use the `@serverless/safeguards-plugin` instead.

#### How safeguards work in Serverless Framework Pro

- Safeguard policies are added to deployment profiles.
- Each deployment profile then can be associated with an individual stage in an app.
- A deployment profile can also be assocaited with the _default_ stage in the app.

#### How safeguard work in @serverless/safeguards-plugin

- Safeguard policies are added to each `serverless.yml` file under `custom.safeguards`.
- Safeguard policies are associated with stages by setting the `stage` field of each policy.

#### Breaking change

The breaking change is best described with the example below. Suppose you have an app with two stages configured, dev and prod. You also have a default
stage which has some safeguard policies.

- default
- dev
- prod

In Serverless Framework Pro, if you deploy to one of the two stages (`dev` or `prod`) then the safegurad policies from the `default` stage
willl NOT run. However, with `@serverless/safeguards-plugin`, you specify default policies by not setting the `stage` field, in which case, the
default policies will also run.

### Automatic Migration

1. [Install the `@serverless/safeguard-plugin`](#installation) to every serverless.yml which uses the Serverless Framework Pro safeguards.
2. Run `serverless safeguards export` from the working directory of the project.
3. Copy the generated YAML into the `serverless.yml`.
4. Delete the safeguards from the deployment profiles in Serverless Framework Pro.

### Manually Migration

1. [Install the `@serverless/safeguard-plugin`](#installation) to every serverless.yml which uses the Serverless Framework Pro safeguards.
2. For each policy defined in the SF Pro dashboard, copy the configuration (name, description, enforcement level, config), into the `custom.safeguards` of your `serverless.yml`. The fields from the Safeguard Policies in the SF Pro dashboard match 1-1 with the fields in the `@serverless/safeguards-plugin`, so it should be as easy as copy-pasting.
3. Set the `stage` field of each policy in `serverless.yml` to match the stage names used in the app. For example, if you had a policy `allowed-regions` in the deployment profile and it was associated with the `prod` stage, then add the field `stage: prod` to the policy in the `serverless.yml`.
4. In SF Pro you have the ability to define stages (e.g. `prod`, `qa`) or use the `default` stage. The default stage is used to enforce safeguard policies from the deployment profile on any stages that don't match the other defined stages. For example, if you have `prod` and `qa` defined, but you deploy to `feature-x`, then the policies associated with the `default` stage will be used. For these policies, do not set the `stage` field, which will cause those policies to be enforced on all stages. At the moment, there isn't a way to define a blacklist for the stages.

# Safeguards available with plugin

The following policies are included and configurable in the [Serverless
Framework Dashboard](https://app.serverless.com/).

### No "\*" in IAM Role statements

**ID: no-wild-iam-role-statements**

This policy performs a simple check to prevent "\*" permissions being used in
AWS IAM Roles by checking for wildcards on Actions and Resources in grant
statements.

#### Resolution

Update the [custom IAM Roles](https://serverless.com/framework/docs/providers/aws/guide/iam#custom-iam-roles)
in the `serverless.yml` to remove IAM Role Statements which grant access to "\*"
on Actions and Resources. If a plugin generates IAM Role Statements, follow the
instructions provided by the plugin developer to mitigate the issue.

### No clear-text credentials in environment variables

**ID: no-secret-env-vars**

Ensures that the [environment variables configured on the AWS Lambda functions](https://serverless.com/framework/docs/providers/aws/guide/functions#environment-variables)
do not contain environment variables values which follow patterns of common
credential formats.

#### Resolution

Resolving this issue requires that the AWS Lambda function environment variables
do not contain any plain-text credentials; however, your functions may still
require those credentials to be passed in by other means.

There are two recommended alternatives of passing in credentials to your AWS
Lambda functions:

- **SSM Parameter Store**: The article "[You should use SSM Parameter Store over Lambda env variables](https://hackernoon.com/you-should-use-ssm-parameter-store-over-lambda-env-variables-5197fc6ea45b)"
  by Yan Cui provides a detailed explanation for using the SSM Parameters in your
  Serverless Framework service to save and retrieve credentials.
- **KMS Encryption**: Encrypt the environment variables using [KMS Keys](https://serverless.com/framework/docs/providers/aws/guide/functions#kms-keys).

### Ensure Dead Letter Queues are attached to functions

**ID: require-dlq**

Ensures all functions with any of the events listed below, or functions with
zero events, have an attached [Dead Letter Queue](https://docs.aws.amazon.com/lambda/latest/dg/dlq.html).

**Events:**

- s3
- sns
- alexaSkill
- iot
- cloudwachEvent
- cloudwatchLog
- cognitoUserPool
- alexaHomeSkill

#### Resolution

Configure the [Dead Letter Queue with SNS or SQS](https://serverless.com/framework/docs/providers/aws/guide/functions#dead-letter-queue-dlq)
for all the functions which require the DLQ to be configured.

### Allowed Runtimes

**ID: allowed-runtimes**

This limits the runtimes that can be used in services. It is configurable with a list of allowed
runtimes or a regular expression.

```yaml
- nodejs8.10
- python3.7
# or:
node.*
```

#### Resolution

Ensure you are using a runtime that is in the list of allowed runtimes or matches the regex of
allowed runtimes.

### Allowed stages

**ID: allowed-stages**

This limits the stages that can be used in services. It is configurable with a list of allowed
stages or a regular expression.

```yaml
- prod
- dev
# or:
'(prod|qa|dev-.*)'
```

#### Resolution

Ensure you are using a runtime that is in the list of allowed stages or matches the regex of
allowed stages.

### Framework Version

**ID: framework-version**

This policy limits which versions of the Serverless Framework can be used. It is configured with a
[semver](https://semver.org/) expression.

```yaml
>=1.44.0 <2.0.0
```

#### Resolution

Install an allowed version of the framework: `npm i -g serverless@$ALLOWED_VERSION`

### Require Cloudformation Deployment Role

**ID: require-cfn-role**

This rule requires you to specify the
[`cfnRole` option](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/)
in your `serverless.yml`. It has no
configuration options.

#### Resolution

Add `cfnRole` to your `serverless.yml`.

### Required stack tags

**ID: required-stack-tags**

This rule requires you to specify certain tags in the
[`stackTags` option](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/)
in your `serverless.yml`. It is configured with a mapping of keys to regex's. All the keys must be
present and value must match the regex.

```yaml
someTagName: '.*'
```

### Require Global VPC

**ID: require-global-vpc**

This rule requires all your functions to be configured with a VPC. By default they are required to
have at least two subnet IDs to allow for AZ failover. It is configurable with a `minNumSubnets`
option:

```yaml
minNumSubnets: 1 # if you don't want to require 2 and AZ support
```

#### Resolution

Add a global VPC configuration to your config:
https://serverless.com/framework/docs/providers/aws/guide/functions/#vpc-configuration

### Allowed function names

**ID: allowed-function-names**

This rule allows you enforce naming conventions functions deployed to AWS lambda.
It is configured with a regular expression. It features one extra addition: variables for stage,
service and function(the key in the serverless yaml) names. See below for some examples.

Require using Serverless's standard naming scheme:

```
${SERVICE}-${STAGE}-${FUNCTION}
```

Or, if you want custom names with stage first and underscores instead of dashes:

```
${STAGE}_${SERVICE}_${FUNCTION}
```

#### Resolution

Use the `name:` config option on the function object to customize the deployed function name to
match the regex: https://serverless.com/framework/docs/providers/aws/guide/functions/#configuration

### Require Description

**ID: require-description**

This rule requires that all functions have a description of minimum or maximum length. By default
it requires a minimum length of 30 and the lambda maximum of 256. Both these values are
configurable however. Here is a config that requires a slightly longer config but doesn't allow as
long a maximum:

```yaml
minLength: 50
maxLength: 100
```

#### Resolution

Add a function description to all your lambdas that is with in the minimum and maximum required
lengths.

### Allowed Regions

**ID: allowed-regions**

This rule allows you to restrict the regions to which a service may be deployed. It is configured
with a list of regions:

```yaml
# eg, us-east-1 and us-west-2 only
- us-east-1
- us-west-2
```

### Restricted deploy times

**ID: restricted-deploy-times**

This policy blocks deploys at certain times. It is configured with a list of objects containing a
time, duration and optional interval.

```yaml
# no deploy specific holidays, eg Rosh Hashanah 2019
- time: 2019-09-29T18:20 # ISO8601 date or datetime
  duration: P2D30M # IS8601 duration
# no deploy a specific day but repeating, eg all future Christmases
- time: 2019-12-25
  duration: P1D
  interval: P1Y
# no deploy fri noon - monday 6AM
- time: 2019-03-08T12:00:00
  duration: P2D18H
  interval: P1W
```

If you only need to specify one interval you can also directly use that object, eg:

```yaml
# no deployments on friday, saturday, sunday
time: 2019-03-08
duration: P3D
interval: P1W
```

#### Resolution

Wait! You're not supposed to be deploying!

### Forbid S3 HTTP Access

**ID: forbid-s3-http-access**

This policy requires that you have a `BucketPolicy` forbidding access over HTTP for each bucket.
There are no configuration options.

#### Resolution

For a bucket without a name such as the `ServerlessDeploymentBucket` ensure that the `resources`
section of your serverless yaml contains a policy like the following using `Ref`s.
If using a different bucket, update the logical name in the `Ref`.

```yaml
resources:
  Resources:
    ServerlessDeploymentBucketPolicy:
      Type: 'AWS::S3::BucketPolicy'
      Properties:
        Bucket: { Ref: ServerlessDeploymentBucket }
        PolicyDocument:
          Statement:
            - Action: 's3:*'
              Effect: 'Deny'
              Principal: '*'
              Resource:
                Fn::Join:
                  - ''
                  - - 'arn:aws:s3:::'
                    - Ref: ServerlessDeploymentBucket
                    - '/*'
              Condition:
                Bool:
                  aws:SecureTransport: false
```

If using a bucket with a name, say configured in the `custom` section of your config, use a policy
like this:

```yaml
resources:
  Resources:
    NamedBucketPolicy:
      Type: 'AWS::S3::BucketPolicy'
      Properties:
        Bucket: ${self:custom.bucketName}
        PolicyDocument:
          Statement:
            - Action: 's3:*'
              Effect: 'Deny'
              Principal: '*'
              Resource: 'arn:aws:s3:::${self:custom.bucketName}/*'
              Condition:
                Bool:
                  aws:SecureTransport: false
```

# Custom Policies

In addition to built-in policies, you can add custom policies to your application.

## Creating a custom service policy

A service policy is simply a Javascript packaged in a module export which you can use in the
Serverless Framework project for your service. To start with a custom policy first create a
directory in your working directory (e.g. `./policies`) to store the policy files.

Create a single JS file to define your policy (e.g. `my-custom-policy.js`) in the
policies directory.

**./policies/my-custom-policy.js**

```javascript
module.exports = function myCustomPolicy(policy, service) {
  // policy.fail(“Configuration is not compliant with policy”)
  policy.approve();
};
```

There are two primary methods you can use to control the behavior of the policy checks
when running the `deploy` command.

- `approve()` - Passes the policy to allow the deploy to continue.
- `fail(message)` - Fails the policy check and returns an failure message.

To define the policy method you’ll need to inspect the configuration. The entire
configuration is made available in the service object. Use the [default policies](https://github.com/serverless/enterprise-plugin/tree/master/src/lib/safeguards/policies)
and [example policies](https://github.com/serverless/enterprise-plugin/tree/master/examples/safeguards-example-service/policies)
as reference to the content of the service object.

### Enabling a custom policy

Once the policy is implemented and saved in the directory, add the `safeguards`
block to the `serverless.yml` file and set the `location` property to reference
the relative path of the policies directory. To enable the policy you must also
add it to the list of policies.

**serverless.yml**

```yaml
custom:
  safeguards:
    - title: Require stage name in table name
      safeguard: stage-in-table-name
      path: ./policies
```

### Adding settings to your policy

Custom policies may also include configuration parameters. The policy function
accepts a third parameter (`options` in the example below) which contains the
settings defined in the `serverless.yml` file.

**./policies/my-custom-policy.js**

```javascript
module.exports = function myCustomPolicy(policy, service, options) {
  // options.max = 2
  policy.approve();
};
```

**serverless.yml**

```yaml
custom:
  safeguards:
    - title: my custom policy
      safeguard: my-custom-policy
      path: ./policies
      config:
        max: 2
```
