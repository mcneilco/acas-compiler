var async, fs, ncp, path, settings, spawn, winston,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

path = require('path');

fs = require('fs');

winston = require('winston');

ncp = require('ncp').ncp;

async = require('async');

spawn = require('child_process').spawn;

exports.logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      timestamp: true,
      colorize: true,
      level: "debug"
    })
  ]
});

exports.runNpmInstall = function(sourcePaths, paths, callback) {
  var environment, install, installCommand, j, len, relativePaths, source, sourcePathsString, util;
  exports.logger.info("finished getting sources");
  relativePaths = [];
  for (j = 0, len = sourcePaths.length; j < len; j++) {
    source = sourcePaths[j];
    relativePaths.push(path.relative(paths.sourcesDirectory + "/base", source));
  }
  sourcePathsString = "." + relativePaths.join(",");
  installCommand = "npm";
  exports.logger.info("running npm install");
  environment = process.env;
  environment.SOURCE_DIRECTORIES = sourcePathsString;
  exports.logger.info("using SOURCE_DIRECTORIES=" + environment.SOURCE_DIRECTORIES);
  environment.BUILD_PATH = paths.buildDirectory;
  exports.logger.info("using BUILD_PATH=" + environment.BUILD_PATH);
  util = require('util');
  fs.writeFile(paths.sourcesDirectory + "/base/rebuild.sh", "export BUILD_PATH=" + environment.BUILD_PATH + "\nexport SOURCE_DIRECTORIES=" + environment.SOURCE_DIRECTORIES + "\nnpm install\ngulp execute:prepare_config_files\ngulp execute:prepareModuleConfJSON\n");
  install = void 0;
  install = spawn(installCommand, ['install'], {
    cwd: paths.sourcesDirectory + "/base",
    env: environment,
    stdio: 'inherit'
  });
  return install.on('exit', function(code) {
    return callback(code);
  });
};

exports.runPrepareConfigFiles = function(paths, callback) {
  var environment, executePrepareConfigFilesCommand, prepareConfigs;
  executePrepareConfigFilesCommand = "grunt";
  environment = process.env;
  prepareConfigs = spawn(executePrepareConfigFilesCommand, ["execute:prepare_config_files"], {
    cwd: paths.sourcesDirectory + "/base",
    env: environment,
    stdio: 'inherit'
  });
  return prepareConfigs.on('exit', function(code) {
    return callback(code);
  });
};

exports.runAdditionalCommands = function(buildDirectory, additionalCommands, callback) {
  var environment;
  environment = process.env;
  return async.eachSeries(additionalCommands, (function(additionalCommand, next) {
    var install;
    exports.logger.info("running additional command: " + additionalCommand.name);
    install = spawn(additionalCommand.command, additionalCommand.args, {
      cwd: buildDirectory,
      env: environment,
      stdio: 'inherit'
    });
    return install.on('exit', function(code) {
      return next(code);
    });
  }), function(err) {
    if (err) {
      exports.logger.error('an additional command failed');
    } else {
      exports.logger.info('all additional commands have run');
      callback();
    }
  });
};

exports.compile = function(settingsFile) {
  var settings;
  exports.logger.info('using settings file: ' + settingsFile);
  settings = require(path.resolve(settingsFile));
  return exports.configurePaths(settings, function(paths) {
    return exports.getSources(settings.sources, paths, function(sourcePaths) {
      return exports.copyFromPreviousInstall(settings.copyFromPreviousInstall, paths, function() {
        return exports.runNpmInstall(sourcePaths, paths, function() {
          return exports.runPrepareConfigFiles(paths, function() {
            return exports.installR(settings.r, paths, function() {
              return exports.runAdditionalCommands(settings.buildDirectory, settings.additionalCommands, function() {
                return exports.logger.info("all done");
              });
            });
          });
        });
      });
    });
  });
};

exports.copyFromPreviousInstall = function(copyFromPreviousInstall, paths, callback) {
  var copyTo, i, idx, j, k, len, len1, oldThingPath, results, thingToCopy;
  if ((paths.oldPath != null) && ((copyFromPreviousInstall != null) && copyFromPreviousInstall.length > 0)) {
    copyTo = [];
    for (j = 0, len = copyFromPreviousInstall.length; j < len; j++) {
      thingToCopy = copyFromPreviousInstall[j];
      copyTo.push(paths.buildDirectory + "/" + thingToCopy);
    }
    if (indexOf.call(copyFromPreviousInstall, "node_modules") >= 0) {
      if (fs.existsSync(paths.oldPath + "/node_modules")) {
        copyFromPreviousInstall.push("node_modules");
        fs.mkdirSync(paths.sourcesDirectory + "/base/" + thingToCopy);
        copyTo.push(paths.sourcesDirectory + "/base/" + thingToCopy);
      }
    }
    i = 0;
    results = [];
    for (idx = k = 0, len1 = copyFromPreviousInstall.length; k < len1; idx = ++k) {
      thingToCopy = copyFromPreviousInstall[idx];
      oldThingPath = path.resolve(paths.oldPath, thingToCopy);
      if (fs.existsSync(oldThingPath)) {
        exports.logger.info("copying " + oldThingPath + " to " + copyTo[idx]);
        exports.copyFolder(oldThingPath, copyTo[idx], (function(_this) {
          return function() {
            i = i + 1;
            if (i === copyFromPreviousInstall.length) {
              return callback();
            }
          };
        })(this));
      } else {
        i = i + 1;
        exports.logger.info("old '" + thingToCopy + "' " + oldThingPath + " does not exist, not copying");
      }
      if (i === copyFromPreviousInstall.length) {
        results.push(callback());
      } else {
        results.push(void 0);
      }
    }
    return results;
  } else {
    return callback();
  }
};

exports.configurePaths = function(settings, callback) {
  var date, newFolder, outObject;
  outObject = {};
  outObject.symLinkBuildPath = settings.installationDirectory + "/acas";
  outObject.symLinkSourcesPath = settings.installationDirectory + "/sources";
  outObject.logPath = settings.installationDirectory + "/logs";
  if (fs.existsSync(outObject.symLinkBuildPath)) {
    if (fs.lstatSync(outObject.symLinkBuildPath).isSymbolicLink()) {
      exports.logger.info("symbolic link already exists " + outObject.symLinkBuildPath + ", replacing");
    } else {
      exports.logger.error(outObject.symLinkBuildPath + " file or directory already exists");
    }
    outObject.oldPath = fs.realpathSync(outObject.symLinkBuildPath);
    fs.unlinkSync(outObject.symLinkBuildPath);
  }
  if (fs.existsSync(outObject.symLinkSourcesPath)) {
    if (fs.lstatSync(outObject.symLinkSourcesPath).isSymbolicLink()) {
      exports.logger.info("symbolic link already exists " + outObject.symLinkSourcesPath + ", replacing");
    } else {
      exports.logger.error("file or directory already exists " + outObject.symLinkSourcesPath);
    }
    fs.unlinkSync(outObject.symLinkSourcesPath);
  }
  if (!fs.existsSync(outObject.logPath)) {
    exports.logger.info("creating dir " + outObject.logPath);
    fs.mkdirSync(outObject.logPath);
  }
  date = (new Date).toISOString().replace(/T/, '-').replace(/:/g, '-').replace(/\..+/, '');
  newFolder = settings.installationDirectory + "/acas-" + date;
  fs.mkdirSync(newFolder);
  outObject.sourcesDirectory = fs.realpathSync(newFolder);
  outObject.buildDirectory = outObject.sourcesDirectory + "-build";
  exports.logger.info("making new build folder " + outObject.buildDirectory);
  fs.mkdirSync(outObject.buildDirectory);
  exports.logger.info("making new sources folder " + outObject.sourcesDirectory);
  process.chdir(settings.installationDirectory);
  exports.logger.info("soft linking new build folder " + outObject.buildDirectory);
  fs.symlinkSync(path.relative(settings.installationDirectory, outObject.buildDirectory), path.relative(settings.installationDirectory, outObject.symLinkBuildPath));
  exports.logger.info("soft linking new sources folder " + outObject.sourcesDirectory);
  fs.symlinkSync(path.relative(settings.installationDirectory, outObject.sourcesDirectory), path.relative(settings.installationDirectory, outObject.symLinkSourcesPath));
  process.chdir = __dirname;
  return callback(outObject);
};

exports.getSources = function(sources, paths, callback) {
  var i, sourcePaths;
  i = 0;
  sourcePaths = [];
  return async.eachSeries(sources, (function(source, next) {
    var sourcePath;
    exports.logger.info("getting source: " + source.name);
    sourcePath = path.join(paths.sourcesDirectory + "/" + source.name);
    sourcePaths.push(sourcePath);
    return exports.getSource(source, sourcePath, function(sourcePath) {
      next();
      i = i + 1;
      if (i === sources.length) {
        return callback(sourcePaths);
      }
    });
  }), function(err) {
    if (err) {
      exports.logger.error('a source failed to download');
    } else {
      exports.logger.info('all sources have been downloaded successfully');
    }
  });
};

exports.getSource = function(source, sourcePath, callback) {
  if (source.type === "git") {
    return exports.getGitSource(source, sourcePath, function(sourcePath) {
      return callback(sourcePath);
    });
  }
};

exports.getGitSource = function(source, sourcePath, callback) {
  return require('simple-git')().clone(source.repository, sourcePath, source.options, function(output) {
    return callback(sourcePath);
  });
};

exports.copyFolder = function(source, destination, callback) {
  ncp.limit = 16;
  return ncp(source, destination, function(err) {
    if (err) {
      exports.logger.error(err);
    }
    return callback();
  });
};

exports.installR = function(rSetting, paths, callback) {
  var environment, install;
  if (rSetting != null) {
    environment = process.env;
    install = spawn("Rscript", ['install.R', rSetting.branch], {
      cwd: paths.buildDirectory + "/src/r/BuildUtilities",
      env: environment,
      stdio: 'inherit'
    });
    return install.on('exit', function(code) {
      return callback(code);
    });
  } else {
    return callback();
  }
};

if (require.main === module) {
  settings = process.argv[2];
  if (settings == null) {
    console.log("usage: node compile.js ./settings.json");
    process.exit();
  }
  exports.compile(settings);
}
