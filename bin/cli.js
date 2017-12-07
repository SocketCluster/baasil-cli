#!/usr/bin/env node

var fs = require('fs-extra');
var YAML = require('yamljs');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var childProcess = require('child_process');
var inquirer = require('inquirer');
var prompt = inquirer.createPromptModule();

var exec = childProcess.exec;
var execSync = childProcess.execSync;
var spawn = childProcess.spawn;
var fork = childProcess.fork;

var command = argv._[0];
var commandRawArgs = process.argv.slice(3);
var commandRawArgsString = commandRawArgs.join(' ');
if (commandRawArgsString.length) {
  commandRawArgsString = ' ' + commandRawArgsString;
}
var arg1 = argv._[1];
var arg2 = argv._[2];

var force = argv.force ? true : false;

var parseJSONFile = function (filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, {encoding: 'utf8'}));
    }
  } catch (e) {}

  return {};
};

var parsePackageFile = function (moduleDir) {
  var packageFile = moduleDir + '/package.json';
  return parseJSONFile(packageFile);
};

var errorMessage = function (message) {
  console.log('\033[0;31m[Error]\033[0m ' + message);
};

var successMessage = function (message) {
  console.log('\033[0;32m[Success]\033[0m ' + message);
};

var warningMessage = function (message) {
  console.log('\033[0;33m[Warning]\033[0m ' + message);
};

var showCorrectUsage = function () {
  console.log('Usage: baasil [options] [command]\n');
  console.log('Options:');
  console.log("  -v            Get the version of the current Baasil.io installation");
  console.log('  --help        Get info on how to use this command');
  console.log('  --force       Force all necessary directory modifications without prompts');
  console.log();
  console.log('Commands:');
  // console.log('  install                       Sets up your environment to run Baasil.io apps locally.');
  // console.log('                                This will install the following programs:');
  // console.log('                                  - docker');
  // console.log('                                  - kubectl');
  console.log('  create <app-name>             Create a new boilerplate SCC app in working directory');
  console.log('  run <path>                    Run app at path inside container on your local machine');
  console.log('  restart <app-path-or-name>    Restart an app with the specified name');
  console.log('  stop <app-path-or-name>       Stop an app with the specified name');
  console.log('  list                          List all running Docker containers on your local machine');
  console.log('  logs <app-path-or-name>       Get logs for the app with the specified name');
  console.log('    -f                          Follow the logs');
  console.log('  deploy <app-path>             Deploy app at path to your Baasil.io cluster');
  // TODO
  // console.log('    --key-path <key-path>       >> Path to your TLS private key');
  // console.log('    --cert-path <cert-path>     >> Path to your TLS cert');
  // console.log('    --tls-pair-name <key-name>  >> A name for your TLS key and cert pair - You choose');
  // console.log('    --auto-generate-tls-pair    >> If this option is specified, Baasil.io will');
  // console.log('                                   automatically generate a TLS key and cert pair');
  // console.log('                                   for you using Letsencrypt');
  console.log('  deploy-update <app-path>      Deploy update to app which was previously deployed');
  console.log('  undeploy <app-path>           Shutdown all core app services running on your cluster');
  console.log('');
  var extraMessage = 'Note that the app-name/app-path in the commands above is optional - If not provided ' +
    'then baasil will use the current working directory as the app path.';
  console.log(extraMessage);
};

var failedToRemoveDirMessage = function (dirPath) {
  errorMessage('Failed to remove existing directory at ' + dirPath + '. This directory may be used by another program or you may not have the permission to remove it.');
};

var failedToCreateMessage = function () {
  errorMessage('Failed to create necessary files. Please check your permissions and try again.');
};

var promptInput = function (message, callback, secret) {
  prompt([
    {
      type: secret ? 'password' : 'input',
      message: message,
      name: 'result',
      default: null
    }
  ]).then((answers) => {
    callback(answers.result);
  }).catch((err) => {
    errorMessage(err.message);
    process.exit();
  });
};

var promptConfirm = function (message, options, callback) {
  var promptOptions = {
    type: 'confirm',
    message: message,
    name: 'result'
  };
  if (options && options.default) {
    promptOptions.default = options.default;
  }
  prompt([
    promptOptions
  ]).then((answers) => {
    callback(answers.result);
  }).catch((err) => {
    errorMessage(err.message);
    process.exit();
  });
};

var copyDirRecursive = function (src, dest) {
  try {
    fs.copySync(src, dest);
    return true;
  } catch (e) {
    failedToCreateMessage();
  }
  return false;
};

var rmdirRecursive = function (dirname) {
  try {
    fs.removeSync(dirname);
    return true;
  } catch (e) {
    failedToRemoveDirMessage(dirname);
  }
  return false;
};

if (argv.help) {
  showCorrectUsage();
  process.exit();
}

if (argv.v) {
  var scDir = __dirname + '/../';
  var scPkg = parsePackageFile(scDir);
  console.log('v' + scPkg.version);
  process.exit();
}

var wd = process.cwd();

var boilerplateDir = __dirname + '/../boilerplates/scc';
var kubernetesSourceDir = __dirname + '/../node_modules/socketcluster/kubernetes';
var destDir = path.normalize(wd + '/' + arg1);
var deploymentYAMLRegex = /-deployment\.yaml$/;

var createFail = function (err) {
  var errString = '';
  if (err && err.message) {
    errString = ' ' + err.message;
  }
  errorMessage(`Failed to create Baasil.io app.${errString}`);
  process.exit();
};

var createSuccess = function () {
  var boilerplatePkg = parsePackageFile(destDir);
  boilerplatePkg.name = arg1;
  var updatedPkgString = JSON.stringify(boilerplatePkg, null, 2);

  fs.writeFileSync(destDir + '/package.json', updatedPkgString);

  successMessage("Baasil.io app '" + destDir + "' was setup successfully.");
  process.exit();
};

var setupMessage = function () {
  console.log('Creating app structure...');
};

var getSocketClusterDeploymentDefPath = function (kubernetesTargetDir) {
  return `${kubernetesTargetDir}/socketcluster-deployment.yaml`;
};

var getSCCBrokerDeploymentDefPath = function (kubernetesTargetDir) {
  return `${kubernetesTargetDir}/scc-broker-deployment.yaml`;
};

var sanitizeYAML = function (yamlString) {
  return yamlString.replace(/emptyDir: ?(null)?\n/g, 'emptyDir: {}\n');
};

if (command == 'create') {

  var continueSetup = function () {
    var kubernetesTargetDir = destDir + '/kubernetes';
    if (copyDirRecursive(boilerplateDir, destDir) && copyDirRecursive(kubernetesSourceDir, kubernetesTargetDir)) {
      var kubeConfSocketCluster = getSocketClusterDeploymentDefPath(kubernetesTargetDir);
      try {
        var kubeConfContentSocketCluster = fs.readFileSync(kubeConfSocketCluster, {encoding: 'utf8'});
        var deploymentConfSocketCluster = YAML.parse(kubeConfContentSocketCluster);

        deploymentConfSocketCluster.spec.template.spec.volumes = [{
          name: 'app-src-volume',
          emptyDir: {}
        }];
        var containers = deploymentConfSocketCluster.spec.template.spec.containers;
        var appSrcContainerIndex;
        containers.forEach((value, index) => {
          if (value && value.name == 'socketcluster') {
            appSrcContainerIndex = index;
            return;
          }
        });
        if (!containers[appSrcContainerIndex].volumeMounts) {
          containers[appSrcContainerIndex].volumeMounts = [];
        }
        containers[appSrcContainerIndex].volumeMounts.push({
          mountPath: '/usr/src/app',
          name: 'app-src-volume'
        });
        containers[appSrcContainerIndex].env.push({
          name: 'SOCKETCLUSTER_WORKER_CONTROLLER',
          value: '/usr/src/app/worker.js'
        });
        containers[appSrcContainerIndex].env.push({
          name: 'SOCKETCLUSTER_MASTER_CONTROLLER',
          value: '/usr/src/app/server.js'
        });
        containers.push({
          name: 'app-src-container',
          image: '', // image name will be generated during deployment
          volumeMounts: [{
            mountPath: '/usr/dest',
            name: 'app-src-volume'
          }],
          lifecycle: {
            postStart: {
              exec: {
                command: ['cp', '-a', '/usr/src/.', '/usr/dest/']
              }
            }
          }
        });
        var formattedYAMLString = sanitizeYAML(YAML.stringify(deploymentConfSocketCluster, Infinity, 2));
        fs.writeFileSync(kubeConfSocketCluster, formattedYAMLString);
      } catch (err) {
        createFail(err);
      }
      createSuccess();
    } else {
      createFail();
    }
  };

  var confirmReplaceSetup = function (confirm) {
    if (confirm) {
      setupMessage();
      if (rmdirRecursive(destDir) && copyDirRecursive(boilerplateDir, destDir)) {
        continueSetup();
      } else {
        createFail();
      }
    } else {
      errorMessage("Baasil.io 'create' action was aborted.");
      process.exit();
    }
  };

  if (arg1) {
    if (fs.existsSync(destDir)) {
      if (force) {
        confirmReplaceSetup(true);
      } else {
        var message = "There is already a directory at " + destDir + '. Do you want to overwrite it?';
        promptConfirm(message, null, confirmReplaceSetup);
      }
    } else {
      setupMessage();
      continueSetup();
    }
  } else {
    errorMessage("The 'create' command requires a valid <appname> as argument.");
    showCorrectUsage();
    process.exit();
  }
} else if (command == 'run') {
  var appPath = arg1 || '.';
  var absoluteAppPath = path.resolve(appPath);
  var pkg = parsePackageFile(appPath);
  var appName = pkg.name;

  var portNumber = Number(argv.p) || 8000;
  var envVarList;
  if (!(argv.e instanceof Array)) {
    envVarList = [argv.e];
  } else {
    envVarList = argv.e;
  }
  var envFlagList = [''];
  envVarList.forEach((value) => {
    envFlagList.push(`-e "${value}"`);
  });
  var envFlagString = envFlagList.join(' ');

  try {
    execSync(`docker stop ${appName}`, {stdio: 'ignore'});
    execSync(`docker rm ${appName}`, {stdio: 'ignore'});
  } catch (e) {}

  var dockerCommand = `docker run -d -p ${portNumber}:8000 -v ${absoluteAppPath}:/usr/src/app/ -e "SOCKETCLUSTER_WORKER_CONTROLLER=/usr/src/app/worker.js" ` +
    `-e "SOCKETCLUSTER_MASTER_CONTROLLER=/usr/src/app/server.js"${envFlagString} --name ${appName} socketcluster/socketcluster:v9.1.10`;

  try {
    execSync(dockerCommand, {stdio: 'inherit'});
    successMessage(`App '${appName}' is running at http://localhost:${portNumber}`);
  } catch (e) {
    errorMessage(`Failed to start app '${appName}'.`);
  }
  process.exit();
} else if (command == 'restart') {
  var appName = arg1;
  if (!appName) {
    var appPath = '.';
    var absoluteAppPath = path.resolve(appPath);
    var pkg = parsePackageFile(appPath);
    appName = pkg.name;
  }
  try {
    execSync(`docker stop ${appName}`, {stdio: 'ignore'});
    successMessage(`App '${appName}' was stopped.`);
  } catch (e) {}
  try {
    execSync(`docker start ${appName}`);
    successMessage(`App '${appName}' is running.`);
  } catch (e) {
    errorMessage(`Failed to start app '${appName}'.`);
  }
  process.exit();
} else if (command == 'stop') {
  var appName = arg1;
  if (!appName) {
    var appPath = '.';
    var absoluteAppPath = path.resolve(appPath);
    var pkg = parsePackageFile(appPath);
    appName = pkg.name;
  }
  try {
    execSync(`docker stop ${appName}`);
    execSync(`docker rm ${appName}`);
    successMessage(`App '${appName}' was stopped.`);
  } catch (e) {
    errorMessage(`Failed to stop app '${appName}'.`);
  }
  process.exit();
} else if (command == 'list') {
  var command = exec(`docker ps${commandRawArgsString}`, function (err) {
    if (err) {
      errorMessage(`Failed to list active containers. ` + err);
    }
    process.exit();
  });
  command.stdout.pipe(process.stdout);
  command.stderr.pipe(process.stderr);
} else if (command == 'logs') {
  var appName = arg1;
  if (!appName) {
    var appPath = '.';
    var absoluteAppPath = path.resolve(appPath);
    var pkg = parsePackageFile(appPath);
    appName = pkg.name;
  }
  var command = exec(`docker logs ${appName}${commandRawArgsString}`, function (err) {
    if (err) {
      errorMessage(`Failed to get logs for '${appName}' app. ` + err);
    }
    process.exit();
  });
  command.stdout.pipe(process.stdout);
  command.stderr.pipe(process.stderr);
} else if (command == 'deploy' || command == 'deploy-update') {
  var appPath = arg1 || '.';
  var absoluteAppPath = path.resolve(appPath);
  var pkg = parsePackageFile(appPath);
  var appName = pkg.name;

  var isUpdate = (command == 'deploy-update');

  var defaultWorkerCount = '1';
  var defaultBrokerCount = '1';
  var doAutoScale = true;
  var targetCPUUtilization = 50;
  var maxPodsPerService = 10;

  var failedToDeploy = function (err) {
    errorMessage(`Failed to deploy the '${appName}' app. ${err.message}`);
    process.exit();
  };

  var baasilConfigFilePath = appPath + '/baasil.json';
  var baasilConfig = parseJSONFile(baasilConfigFilePath);

  var parseVersionTag = function (fullImageName) {
    var matches = fullImageName.match(/:[^:]*$/);
    if (!matches) {
      return '';
    }
    return matches[0] || '';
  };

  var setImageVersionTag = function (imageName, versionTag) {
    if (versionTag.indexOf(':') != 0) {
      versionTag = ':' + versionTag;
    }
    return imageName.replace(/(\/[^\/:]*)(:[^:]*)?$/g, `$1${versionTag}`);
  };

  var handleDockerVersionTagAndPushToDockerImageRepo = function (versionTag) {
    var dockerConfig = baasilConfig.docker;
    var authParts = (new Buffer(dockerConfig.auth, 'base64')).toString('utf8').split(':');
    var username = authParts[0];
    var password = authParts[1];
    var dockerLoginCommand = `docker login -u ${username} -p ${password}`;

    var fullVersionTag;
    if (versionTag) {
      fullVersionTag = `:${versionTag}`;
    } else {
      fullVersionTag = parseVersionTag(dockerConfig.imageName);
    }
    dockerConfig.imageName = setImageVersionTag(dockerConfig.imageName, fullVersionTag);
    try {
      fs.writeFileSync(baasilConfigFilePath, JSON.stringify(baasilConfig, null, 2));

      execSync(`docker build -t ${dockerConfig.imageName} .`, {stdio: 'inherit'});
      execSync(`${dockerLoginCommand}; docker push ${dockerConfig.imageName}`, {stdio: 'inherit'});

      var kubernetesDirPath = appPath + '/kubernetes';

      var kubeConfSocketCluster = getSocketClusterDeploymentDefPath(kubernetesDirPath);
      var kubeConfContentSocketCluster = fs.readFileSync(kubeConfSocketCluster, {encoding: 'utf8'});

      var deploymentConfSocketCluster = YAML.parse(kubeConfContentSocketCluster);
      var configSocketCluster = baasilConfig.socketCluster || {};

      var containersSocketCluster = deploymentConfSocketCluster.spec.template.spec.containers;
      containersSocketCluster.forEach((value, index) => {
        if (value) {
          if (value.name == 'app-src-container') {
            containersSocketCluster[index].image = dockerConfig.imageName;
          } else if (value.name == 'socketcluster') {
            if (!containersSocketCluster[index].env) {
              containersSocketCluster[index].env = [];
            }
            containersSocketCluster[index].env = containersSocketCluster[index].env.filter((envObject) => {
              return envObject.name != 'SOCKETCLUSTER_WORKERS' && envObject.name != 'SOCKETCLUSTER_BROKERS';
            });
            containersSocketCluster[index].env.push({
              name: 'SOCKETCLUSTER_WORKERS',
              value: String(configSocketCluster.workers || defaultWorkerCount)
            });
            containersSocketCluster[index].env.push({
              name: 'SOCKETCLUSTER_BROKERS',
              value: String(configSocketCluster.brokers || defaultBrokerCount)
            });
          }
        }
      });

      var formattedYAMLStringSocketCluster = sanitizeYAML(YAML.stringify(deploymentConfSocketCluster, Infinity, 2));
      fs.writeFileSync(kubeConfSocketCluster, formattedYAMLStringSocketCluster);

      var kubeConfSCCBroker = getSCCBrokerDeploymentDefPath(kubernetesDirPath);
      var kubeConfContentSCCBroker = fs.readFileSync(kubeConfSCCBroker, {encoding: 'utf8'});

      var deploymentConfSCCBroker = YAML.parse(kubeConfContentSCCBroker);
      var configSCCBroker = baasilConfig.sccBroker || {};

      var containersSCCBroker = deploymentConfSCCBroker.spec.template.spec.containers;

      containersSCCBroker.forEach((value, index) => {
        if (value) {
          if (value.name == 'scc-broker') {
            if (!containersSCCBroker[index].env) {
              containersSCCBroker[index].env = [];
            }
            containersSCCBroker[index].env = containersSCCBroker[index].env.filter((envObject) => {
              return envObject.name != 'SOCKETCLUSTER_WORKERS' && envObject.name != 'SOCKETCLUSTER_BROKERS';
            });
            containersSCCBroker[index].env.push({
              name: 'SOCKETCLUSTER_WORKERS',
              value: String(configSCCBroker.workers || defaultWorkerCount)
            });
            containersSCCBroker[index].env.push({
              name: 'SOCKETCLUSTER_BROKERS',
              value: String(configSCCBroker.brokers || defaultBrokerCount)
            });
          }
        }
      });

      var formattedYAMLStringSCCBroker = sanitizeYAML(YAML.stringify(deploymentConfSCCBroker, Infinity, 2));
      fs.writeFileSync(kubeConfSCCBroker, formattedYAMLStringSCCBroker);

      var ingressKubeFileName = 'scc-ingress.yaml';
      var socketClusterDeploymentFileName = 'socketcluster-deployment.yaml';

      var deploySuccess = () => {
        successMessage(`The '${appName}' app was deployed successfully - You should be able to access it online ` +
        `once it has finished booting up. Check your Rancher control panel from http://baasil.io to track the boot progress and to find out which IP address(es) have been exposed to the internet.`);
        process.exit();
      };

      if (isUpdate) {
        try {
          execSync(`kubectl replace -f ${kubernetesDirPath}/${socketClusterDeploymentFileName}`, {stdio: 'inherit'});
        } catch (err) {}

        deploySuccess();
      } else {
        var kubeFiles = fs.readdirSync(kubernetesDirPath);
        var serviceAndDeploymentKubeFiles = kubeFiles.filter((configFilePath) => {
          return configFilePath != ingressKubeFileName;
        });
        var deploymentRegex = /\-deployment\.yaml/;
        var scalableDeploymentsKubeFiles = kubeFiles.filter((configFilePath) => {
          return deploymentRegex.test(configFilePath) && configFilePath != 'scc-state-deployment.yaml';
        });
        serviceAndDeploymentKubeFiles.forEach((configFilePath) => {
          var absolutePath = path.resolve(kubernetesDirPath, configFilePath);
          execSync(`kubectl create -f ${absolutePath}`, {stdio: 'inherit'});
        });

        if (doAutoScale) {
          scalableDeploymentsKubeFiles.forEach((configFilePath) => {
            var absolutePath = path.resolve(kubernetesDirPath, configFilePath);
            var hpaName = configFilePath.replace(deploymentYAMLRegex, '');
            try {
              execSync(`kubectl delete hpa ${hpaName}`, {stdio: 'ignore'});
            } catch (e) {}

            execSync(`kubectl autoscale -f ${absolutePath} --cpu-percent=${targetCPUUtilization} --max=${maxPodsPerService} --min=1`, {stdio: 'inherit'});
          });
        }

        // Wait a few seconds before deploying ingress (due to a bug in Rancher).
        setTimeout(() => {
          try {
            execSync(`kubectl create -f ${kubernetesDirPath}/${ingressKubeFileName}`, {stdio: 'inherit'});
            deploySuccess();
          } catch (err) {
            failedToDeploy(err);
          }
        }, 7000);
      }
    } catch (err) {
      failedToDeploy(err);
    }
  };

  var incrementVersion = function (versionString) {
    return versionString.replace(/[^.]$/, (match) => {
      return parseInt(match) + 1;
    });
  };

  var pushToDockerImageRepo = function () {
    var versionTagString = parseVersionTag(baasilConfig.docker.imageName).replace(/^:/, '');
    var nextVersionTag;
    if (versionTagString) {
      if (isUpdate) {
        nextVersionTag = incrementVersion(versionTagString);
        baasilConfig.docker.imageName = setImageVersionTag(baasilConfig.docker.imageName, nextVersionTag);
      } else {
        nextVersionTag = versionTagString;
      }
    } else {
      nextVersionTag = '""';
    }

    promptInput(`Enter the Docker version tag for this deployment (Default: ${nextVersionTag}):`, handleDockerVersionTagAndPushToDockerImageRepo);
  };

  if (baasilConfig.docker && baasilConfig.docker.imageRepo && baasilConfig.docker.auth) {
    pushToDockerImageRepo();
  } else {
    var dockerUsername, dockerPassword, dockerImageName, dockerDefaultImageName, dockerDefaultImageVersionTag;
    var saveBaasilConfigs = function () {
      baasilConfig.docker = {
        imageRepo: 'https://index.docker.io/v1/',
        imageName: dockerImageName,
        auth: (new Buffer(`${dockerUsername}:${dockerPassword}`)).toString('base64')
      };
      try {
        fs.writeFileSync(baasilConfigFilePath, JSON.stringify(baasilConfig, null, 2));
      } catch (err) {
        failedToDeploy(err);
      }
      pushToDockerImageRepo();
    };

    var handleDockerImageName = function (imageName) {
      if (imageName) {
        dockerImageName = imageName;
      } else {
        dockerImageName = setImageVersionTag(dockerDefaultImageName, dockerDefaultImageVersionTag);
      }
      saveBaasilConfigs();
    };

    var promptDockerImageName = function () {
      dockerDefaultImageName = `${dockerUsername}/${appName}`;
      dockerDefaultImageVersionTag = 'v1.0.0';

      promptInput(`Enter the Docker image name without the version tag (Or press enter for default: ${dockerDefaultImageName}):`, handleDockerImageName);
    };

    var handleMaxPodsPerService = function (maxPods) {
      if (maxPods) {
        maxPodsPerService = Number(maxPods);
      }
      promptDockerImageName();
    };

    var handleTargetCPUUsage = function (targetCPU) {
      if (targetCPU) {
        targetCPUUtilization = Number(targetCPU);
      }
      promptInput(`What is the maximum number of pods per service (Default: ${maxPodsPerService})`, handleMaxPodsPerService);
    };

    var handleAutoScale = function (autoScale) {
      doAutoScale = !(autoScale == false);
      if (doAutoScale) {
        promptInput(`What is the target CPU utilization percentage (for auto-scale); number must be between 0 and 100 (Default: ${targetCPUUtilization})`, handleTargetCPUUsage);
      } else {
        promptDockerImageName();
      }
    };

    var promptAutoScale = function () {
      promptConfirm(`Would you like to auto-scale your services?`, {default: doAutoScale}, handleAutoScale);
    };

    var handleBrokerCount = function (brokerCount) {
      if (brokerCount) {
        baasilConfig.socketCluster.brokers = brokerCount;
        baasilConfig.sccBroker.brokers = brokerCount;
      }
      // TODO: Uncomment once autoscale has been fixed in Rancher/Kubernetes
      // promptAutoScale();
      promptDockerImageName();
    };

    var handleWorkerCount = function (workerCount) {
      if (workerCount) {
        baasilConfig.socketCluster.workers = workerCount;
        baasilConfig.sccBroker.workers = workerCount;
      }
      if (!baasilConfig.socketCluster.brokers) {
        baasilConfig.socketCluster.brokers = defaultBrokerCount;
      }
      if (!baasilConfig.sccBroker.brokers) {
        baasilConfig.sccBroker.brokers = defaultBrokerCount;
      }
      var currentBrokerCount = baasilConfig.socketCluster.brokers;
      promptInput(`Enter the number of brokers for each SocketCluster instance (Default: ${currentBrokerCount}):`, handleBrokerCount);
    };

    var promptWorkerCount = function () {
      if (!baasilConfig.socketCluster) {
        baasilConfig.socketCluster = {};
      }
      if (!baasilConfig.sccBroker) {
        baasilConfig.sccBroker = {};
      }
      if (!baasilConfig.socketCluster.workers) {
        baasilConfig.socketCluster.workers = defaultWorkerCount;
      }
      if (!baasilConfig.sccBroker.workers) {
        baasilConfig.sccBroker.workers = defaultWorkerCount;
      }
      var currentWorkerCount = baasilConfig.socketCluster.workers;
      promptInput(`Enter the number of workers for each SocketCluster instance (Default: ${currentWorkerCount}):`, handleWorkerCount);
    };

    var handlePassword = function (password) {
      dockerPassword = password;
      promptWorkerCount();
    };

    var handleUsername = function (username) {
      dockerUsername = username;
      promptInput('Enter your DockerHub password:', handlePassword, true);
    };
    promptInput('Enter your DockerHub username:', handleUsername);
  }
} else if (command == 'undeploy') {
  var appPath = arg1 || '.';

  var pkg = parsePackageFile(appPath);
  var appName = pkg.name;

  var kubernetesDirPath = appPath + '/kubernetes';
  var kubeFiles = fs.readdirSync(kubernetesDirPath);
  kubeFiles.forEach((configFilePath) => {
    var absolutePath = path.resolve(kubernetesDirPath, configFilePath);
    try {
      execSync(`kubectl delete -f ${absolutePath}`, {stdio: 'inherit'});
    } catch (err) {}
  });

  var deploymentRegex = /\-deployment\.yaml/;
  var scalableDeploymentsKubeFiles = kubeFiles.filter((configFilePath) => {
    return deploymentRegex.test(configFilePath) && configFilePath != 'scc-state-deployment.yaml';
  });
  scalableDeploymentsKubeFiles.forEach((configFilePath) => {
    var hpaName = configFilePath.replace(deploymentYAMLRegex, '');
    execSync(`kubectl delete hpa ${hpaName}`, {stdio: 'inherit'});
  });

  successMessage(`The '${appName}' app was undeployed successfully.`);

  process.exit();
} else {
  errorMessage(`'${command}' is not a valid Baasil.io command.`);
  showCorrectUsage();
  process.exit();
}
