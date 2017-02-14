[TOC]

##Basic Client Installs (see usage statement)

Usage:

```
node compile.js
usage: node compile.js ./settings.json
```

Example settings.json:

```json
{
	"installationDirectory": "build",
	"copyFromPreviousInstall": [
		"privateUploads",
		"r_libs",
		"node_modules"
	],
	"r": {
		"branch": "1.10-release"
	},
	"additionalCommands": [
	{
		"name": "config.r",
		"command": "Rscript",
		"args": [
			"conf/config.R"
		]
	}
	],
	"sources": [
	{
		"_comment": "note, base must always be present",
		"name": "base",
		"type": "git",
		"repository": "https://github.com/mcneilco/acas.git",
		"options": [
			"--branch=1.10-release",
			"--single-branch"
		]
	},
	{
		"name": "mcneilco_custom",
		"type": "git",
		"repository": "https://bitbucket.org/mcneilco/acas.git",
		"options": [
			"--branch=1.10-release-mcneilco-private",
			"--single-branch"
		]
	},
	{
			"name": "acas_custom_host4",
			"type": "git",
			"repository": "https://bitbucket.org/mcneilco/acas_custom_host4.git",
			"options": [
				"--branch=master",
				"--single-branch"
			]
		}
	]
}
```
