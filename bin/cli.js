#!/usr/bin/env node

process.stdin.resume();
process.stdin.setEncoding('utf8');

var fs = require('fs-extra');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var childProcess = require('child_process');
var exec = childProcess.exec;
var execSync = childProcess.execSync;
var spawn = childProcess.spawn;
var fork = childProcess.fork;

var command = argv._[0];
var commandRawArgs = process.argv.slice(3);
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
}

var errorMessage = function (message) {
  console.log('\033[0;31m[Error]\033[0m ' + message);
}

var successMessage = function (message) {
  console.log('\033[0;32m[Success]\033[0m ' + message);
}

var warningMessage = function (message) {
  console.log('\033[0;33m[Warning]\033[0m ' + message);
}

// TODO: Add baasil logs command
var showCorrectUsage = function () {
  console.log('Usage: baasil [options] [command]\n');
  console.log('Options:');
  console.log("  -v            Get the version of the current Baasil.io installation");
  console.log('  --help        Get info on how to use this command');
  console.log('  --force       Force all necessary directory modifications without prompts');
  console.log();
  console.log('Commands:');
  console.log('  install                       Sets up your environment to run Baasil.io apps locally.');
  // console.log('                                This will install the following programs:');
  // console.log('                                  - docker');
  // console.log('                                  - kubectl');
  console.log('  create <app-name>             Create a new boilerplate SCC app in working directory');
  console.log('  run <path>                    Run app at path inside container on your local machine');
  console.log('  restart <app-name>            Restart an app with the specified name');
  console.log('  stop <app-name>               Stop an app with the specified name');
  console.log('  list                          List all running Docker containers on your local machine');
  console.log('  deploy <cluster-name> <path>  Deploy app at path to your Baasil.io cluster');
  console.log('    --key-path <key-path>       >> Path to your TLS private key');
  console.log('    --cert-path <cert-path>     >> Path to your TLS cert');
  console.log('    --tls-pair-name <key-name>  >> A name for your TLS key and cert pair - You choose');
  console.log('    --auto-generate-tls-pair    >> If this option is specified, Baasil.io will');
  console.log('                                   automatically generate a TLS key and cert pair');
  console.log('                                   for you using Letsencrypt');
}

var failedToRemoveDirMessage = function (dirPath) {
  errorMessage('Failed to remove existing directory at ' + dirPath + '. This directory may be used by another program or you may not have the permission to remove it.');
}

var failedToCreateMessage = function () {
  errorMessage('Failed to create necessary files. Please check your permissions and try again.');
}

var prompt = function (message, callback) {
  process.stdout.write(message + ' ');
  process.stdin.on('data', function inputHandler(text) {
    process.stdin.removeListener('data', inputHandler);
    callback(text.replace(/[\r\n]/g, ''))
  });
}

var promptConfirm = function (message, callback) {
  prompt(message, function (data) {
    data = data.toLowerCase().replace(/[\r\n]/g, '');
    callback(data == 'y' || data == 'yes');
  });
}

var copyDirRecursive = function (src, dest) {
  try {
    fs.copySync(src, dest);
    return true;
  } catch (e) {
    failedToCreateMessage();
  }
  return false;
}

var rmdirRecursive = function (dirname) {
  try {
    fs.removeSync(dirname);
    return true;
  } catch (e) {
    failedToRemoveDirMessage(dirname);
  }
  return false;
}

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
var destDir = path.normalize(wd + '/' + arg1);

var createFail = function () {
  errorMessage("Failed to create Baasil.io app.");
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

var confirmReplaceSetup = function (confirm) {
  if (confirm) {
    setupMessage();
    if (rmdirRecursive(destDir) && copyDirRecursive(boilerplateDir, destDir)) {
      createSuccess();
    } else {
      createFail();
    }
  } else {
    errorMessage("Baasil.io 'create' action was aborted.");
    process.exit();
  }
};

if (command == 'create') {
  if (arg1) {
    if (fs.existsSync(destDir)) {
      if (force) {
        confirmReplaceSetup(true);
      } else {
        var message = "There is already a directory at " + destDir + '. Do you want to overwrite it? (y/n)';
        promptConfirm(message, confirmReplaceSetup);
      }
    } else {
      setupMessage();
      if (copyDirRecursive(boilerplateDir, destDir)) {
        createSuccess();
      } else {
        createFail();
      }
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

  try {
    execSync(`docker stop ${appName}`, {stdio: 'ignore'});
    execSync(`docker rm ${appName}`, {stdio: 'ignore'});
  } catch (e) {}

  var dockerCommand = `docker run -d -p ${portNumber}:8000 -v ${absoluteAppPath}:/usr/src/app/ -e "SOCKETCLUSTER_WORKER_CONTROLLER=/usr/src/app/worker.js" ` +
    `--name ${appName} socketcluster/socketcluster:v5.0.0`;

  try {
    execSync(dockerCommand);
    successMessage(`App '${appName}' is running at http://localhost:${portNumber}`);
  } catch (e) {
    errorMessage(`Failed to start app '${appName}'.`);
  }
  process.exit();
} else if (command == 'restart') {
  var appName = arg1;
  try {
    execSync(`docker stop ${appName}`, {stdio: 'ignore'});
    successMessage(`App '${appName}' was stoppped.`);
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
  try {
    execSync(`docker stop ${appName}`);
    execSync(`docker rm ${appName}`);
    successMessage(`App '${appName}' was stoppped.`);
  } catch (e) {
    errorMessage(`Failed to stop app '${appName}'.`);
  }
  process.exit();
} else if (command == 'list') {
  try {
    var containerLog = execSync(`docker ps`).toString();
    process.stdout.write(containerLog);
  } catch (e) {
    errorMessage(`Failed to list active containers.`);
  }
  process.exit();
} else if (command == 'deploy') {
  var clusterName = arg1;
  if (!clusterName) {
    errorMessage(`The first argument to the command line needs to be the name of the cluster.`);
    process.exit();
  }
  var appPath = arg2 || '.';
  var absoluteAppPath = path.resolve(appPath);
  var pkg = parsePackageFile(appPath);
  var appName = pkg.name;
  console.log(`Preparing to deploy '${appName}' to the '${clusterName}' cluster...`);

  var baasilConfigFilePath = appPath + '/baasil.json';
  var baasilConfig = parseJSONFile(baasilConfigFilePath);

  var parseVersionTag = function (fullImageName) {
    return fullImageName.match(/:[^:]*$/)[0] || '';
  };

  var handleDockerVersionTag = function (versionTag) {
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
    dockerConfig.imageName = dockerConfig.imageName.replace(/(\/[^\/:]*)(:[^:]*)?$/g, `$1${fullVersionTag}`);
    fs.writeFileSync(baasilConfigFilePath, JSON.stringify(baasilConfig, null, 2));

    // TODO
    // execSync(`docker build .`);
    // execSync(`${dockerLoginCommand}; docker push ${dockerConfig.imageName}`);
  };

  var pushToDockerImageRepo = function () {
    var currentVersionTag = (parseVersionTag(baasilConfig.docker.imageName) || '""').replace(/^:/, '');
    prompt(`Enter the Docker version tag for this deployment (Default: ${currentVersionTag}):`, handleDockerVersionTag);
  };

  if (baasilConfig.docker && baasilConfig.docker.imageRepo && baasilConfig.docker.auth) {
    pushToDockerImageRepo();
  } else {
    var dockerUsername, dockerPassword, dockerImageName, dockerDefaultImageName;
    var saveBaasilConfigs = function () {
      baasilConfig.docker = {
        imageRepo: 'https://index.docker.io/v1/',
        imageName: dockerImageName,
        auth: (new Buffer(`${dockerUsername}:${dockerPassword}`)).toString('base64')
      };
      fs.writeFileSync(baasilConfigFilePath, JSON.stringify(baasilConfig, null, 2));
      pushToDockerImageRepo();
    };

    var handleDockerImageName = function (imageName) {
      if (imageName) {
        dockerImageName = imageName;
      } else {
        dockerImageName = dockerDefaultImageName;
      }
      saveBaasilConfigs();
    };
    var handlePassword = function (password) {
      dockerPassword = password;
      dockerDefaultImageName = `${dockerUsername}/${appName}`;
      prompt(`Enter the Docker image name without the version tag (Or press enter for default: ${dockerDefaultImageName}):`, handleDockerImageName);
    };
    var handleUsername = function (username) {
      dockerUsername = username;
      prompt('Enter your DockerHub password:', handlePassword);
    };
    prompt('Enter your DockerHub username:', handleUsername);
  }
} else {
  errorMessage(`'${command}' is not a valid Baasil.io command.`);
  showCorrectUsage();
  process.exit();
}
