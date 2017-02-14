path = require 'path'
fs = require 'fs'
winston = require 'winston'
ncp = require('ncp').ncp
async = require('async')
spawn = require('child_process').spawn

exports.logger = new winston.Logger
	transports: [
		new winston.transports.Console
			timestamp:true
			colorize: true
#			level: argv.loglevel
			level: "debug"
	]

exports.runNpmInstall = (sourcePaths, paths, callback) ->
	exports.logger.info "finished getting sources"
	relativePaths = []
	relativePaths.push path.relative("#{paths.sourcesDirectory}/base", source) for source in sourcePaths
	sourcePathsString = "."+relativePaths.join ","
	installCommand = "npm"
	exports.logger.info "running npm install"
	environment = process.env
	environment.SOURCE_DIRECTORIES = sourcePathsString
	exports.logger.info "using SOURCE_DIRECTORIES=#{environment.SOURCE_DIRECTORIES}"
	environment.BUILD_PATH = paths.buildDirectory
	exports.logger.info "using BUILD_PATH=#{environment.BUILD_PATH}"
	util = require('util')
	fs.writeFile "#{paths.sourcesDirectory}/base/rebuild.sh", "export BUILD_PATH=#{environment.BUILD_PATH}\nexport SOURCE_DIRECTORIES=#{environment.SOURCE_DIRECTORIES}\nnpm install\ngrunt execute:prepare_config_files\ngrunt execute:prepare_module_conf_json\n"
	install = undefined
	install = spawn(installCommand, [ 'install' ],
		cwd: "#{paths.sourcesDirectory}/base",
		env: environment,
		stdio: 'inherit')
	install.on 'exit', (code) ->
		callback code

exports.runPrepareConfigFiles = (paths, callback) ->
	executePrepareConfigFilesCommand = "grunt"
	environment = process.env
	prepareConfigs = spawn(executePrepareConfigFilesCommand, ["execute:prepare_config_files"]
		{
			cwd: "#{paths.sourcesDirectory}/base",
			env: environment
			stdio: 'inherit'
		})
	prepareConfigs.on 'exit', (code) ->
		callback(code)

exports.runAdditionalCommands = (buildDirectory, additionalCommands, callback) ->
	environment = process.env
	async.eachSeries additionalCommands, ((additionalCommand, next) ->
# Perform operation on file here.
		exports.logger.info "running additional command: #{additionalCommand.name}"
		install = spawn(additionalCommand.command, additionalCommand.args,
			cwd: buildDirectory,
			env: environment,
			stdio: 'inherit')
		install.on 'exit', (code) ->
			next code
	), (err) ->
# if any of the file processing produced an error, err would equal that error
		if err
# One of the iterations produced an error.
# All processing will now stop.
			exports.logger.error 'an additional command failed'
		else
			exports.logger.info 'all additional commands have run'
			callback()
		return


exports.compile = (settingsFile) ->
	exports.logger.info 'using settings file: ' + settingsFile
	settings = require(path.resolve(settingsFile));
	exports.configurePaths settings, (paths) ->
		exports.getSources settings.sources, paths, (sourcePaths) ->
			exports.copyFromPreviousInstall settings.copyFromPreviousInstall, paths, ->
				exports.runNpmInstall sourcePaths, paths, ->
					exports.runPrepareConfigFiles paths, ->
						exports.installR settings.r, paths, ->
							exports.runAdditionalCommands settings.buildDirectory, settings.additionalCommands, ->
								exports.logger.info "all done"

exports.copyFromPreviousInstall = (copyFromPreviousInstall, paths, callback) ->
	if paths.oldPath? and (copyFromPreviousInstall? && copyFromPreviousInstall.length > 0)
		copyTo = []
		copyTo.push("#{paths.buildDirectory}/#{thingToCopy}") for thingToCopy in copyFromPreviousInstall
		if "node_modules" in copyFromPreviousInstall
			if fs.existsSync "#{paths.oldPath}/node_modules"
				copyFromPreviousInstall.push "node_modules"
				fs.mkdirSync "#{paths.sourcesDirectory}/base/#{thingToCopy}"
				copyTo.push "#{paths.sourcesDirectory}/base/#{thingToCopy}"
		i=0
		for thingToCopy, idx in copyFromPreviousInstall
			oldThingPath = path.resolve(paths.oldPath,thingToCopy)
			if fs.existsSync(oldThingPath)
				exports.logger.info "copying #{oldThingPath} to #{copyTo[idx]}"
				exports.copyFolder oldThingPath, copyTo[idx], =>
					i=i+1
					if i == copyFromPreviousInstall.length
						callback()
			else
				i=i+1
				exports.logger.info "old '#{thingToCopy}' #{oldThingPath} does not exist, not copying"
			if i == copyFromPreviousInstall.length
				callback()
	else
		callback()

exports.configurePaths = (settings, callback) ->
	outObject = {}
	outObject.symLinkBuildPath = "#{settings.installationDirectory}/acas"
	outObject.symLinkSourcesPath = "#{settings.installationDirectory}/sources"
	outObject.logPath = "#{settings.installationDirectory}/logs"
	if fs.existsSync(outObject.symLinkBuildPath)
		if fs.lstatSync(outObject.symLinkBuildPath).isSymbolicLink()
			exports.logger.info "symbolic link already exists #{outObject.symLinkBuildPath}, replacing"
		else
			exports.logger.error "#{outObject.symLinkBuildPath} file or directory already exists"
		outObject.oldPath = fs.realpathSync outObject.symLinkBuildPath
		fs.unlinkSync(outObject.symLinkBuildPath)
	if fs.existsSync(outObject.symLinkSourcesPath)
		if fs.lstatSync(outObject.symLinkSourcesPath).isSymbolicLink()
			exports.logger.info "symbolic link already exists #{outObject.symLinkSourcesPath}, replacing"
		else
			exports.logger.error "file or directory already exists #{outObject.symLinkSourcesPath}"
		fs.unlinkSync(outObject.symLinkSourcesPath)
	if !fs.existsSync(outObject.logPath)
		exports.logger.info "creating dir #{outObject.logPath}"
		fs.mkdirSync(outObject.logPath)

	#Make new ACAS folder
	date = (new Date).toISOString().replace(/T/, '-').replace(/:/g, '-').replace /\..+/, ''
	newFolder = "#{settings.installationDirectory}/acas-#{date}"
	fs.mkdirSync(newFolder)
	outObject.sourcesDirectory = fs.realpathSync(newFolder)
	outObject.buildDirectory= "#{outObject.sourcesDirectory}-build"
	exports.logger.info "making new build folder #{outObject.buildDirectory}"
	fs.mkdirSync(outObject.buildDirectory)
	exports.logger.info "making new sources folder #{outObject.sourcesDirectory}"
	process.chdir settings.installationDirectory
	exports.logger.info "soft linking new build folder #{outObject.buildDirectory}"
	fs.symlinkSync(path.relative(settings.installationDirectory,outObject.buildDirectory), path.relative(settings.installationDirectory,outObject.symLinkBuildPath))
	exports.logger.info "soft linking new sources folder #{outObject.sourcesDirectory}"
	fs.symlinkSync(path.relative(settings.installationDirectory,outObject.sourcesDirectory), path.relative(settings.installationDirectory,outObject.symLinkSourcesPath))
	process.chdir = __dirname
	callback(outObject)

exports.getSources = (sources, paths, callback) ->
	i=0
	sourcePaths=[]
	async.eachSeries sources, ((source, next) ->
	# Perform operation on file here.
		exports.logger.info "getting source: #{source.name}"
		sourcePath = path.join("#{paths.sourcesDirectory}/#{source.name}")
		sourcePaths.push sourcePath
		exports.getSource source, sourcePath, (sourcePath) ->
			next()
			i=i+1
			if i == sources.length
				callback(sourcePaths)
		), (err) ->
		# if any of the file processing produced an error, err would equal that error
			if err
		# One of the iterations produced an error.
		# All processing will now stop.
				exports.logger.error 'a source failed to download'
			else
				exports.logger.info 'all sources have been downloaded successfully'
			return

exports.getSource = (source, sourcePath, callback) ->
	if source.type == "git"
		exports.getGitSource source, sourcePath, (sourcePath) ->
			callback(sourcePath)

exports.getGitSource = (source, sourcePath, callback) ->
	require('simple-git')().clone source.repository, sourcePath, source.options, (output) ->
		callback(sourcePath)

exports.copyFolder = (source, destination, callback) ->
	ncp.limit = 16
	ncp source, destination, (err) ->
		if err
			exports.logger.error err
		callback()

		
exports.installR = (rSetting, paths, callback) ->
	if rSetting?
		environment = process.env
		install = spawn("Rscript", [ 'install.R', rSetting.branch ],
			cwd: "#{paths.buildDirectory}/src/r/BuildUtilities",
			env: environment
			stdio: 'inherit'
		)

		install.on 'exit', (code) ->
			callback code
	else
		callback()

if require.main == module
	settings = process.argv[2]
	if !settings?
		console.log "usage: node compile.js ./settings.json"
		process.exit()
	exports.compile settings
