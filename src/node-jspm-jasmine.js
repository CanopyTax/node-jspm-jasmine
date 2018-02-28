import glob from "glob";
import fs from "fs";
import jspm from "jspm";
import rimraf from 'rimraf';
import path from "path";
import minimatch from 'minimatch';
import Jasmine from "jasmine";
import { Instrumenter, Report } from 'istanbul';
import { remap } from "remap-istanbul";
import inlineSourceMap from "inline-source-map-comment";
import chalk from 'chalk';
import mkdirp from 'mkdirp';
import exit from 'exit';

import Timer from './timer.js';
import * as Mocker from './mocker.js';
import { isWatching, initWatcher, watchFile, finishedTestRun as notifyWatcherFinishedTestRun } from './watcher.js';

function errorCallbackDefault(err, safeExit, optionalMessage) {
	if (err) {
		console.log(chalk.red(err && err.stack ? err.stack : err));
	}
	if (optionalMessage) {
		console.log('');
		console.log(chalk.inverse(optionalMessage));
	}
	if (!isWatching()) {
		if (safeExit) {
			safeExit();
		} else {
			exit(1);
		}
	}
}

export function runTests(opts, errCallback = errorCallbackDefault) {
	opts.watchFiles = opts.watchFiles || [];
	initWatcher(!!opts.watch || opts.watchFiles.length > 0, opts, errCallback);

	const timer = Timer.start();

	const originalErrCallback = errCallback;
	errCallback = function() {
		timer.finish();
		notifyWatcherFinishedTestRun();

		return originalErrCallback.apply(this, arguments);
	}

	const SystemJS = new jspm.Loader();

	global.System = global.SystemJS = SystemJS; // For middleware
	/* helperPromises is intended to be used internally and externally inside of
	 * helper files that need to do some asynchronous behavior before the rest
	 * of the tests continue
	 */
	global.helperPromises = [];

	let packagePath = '.';
	try {
		if (typeof opts.packagePath === 'string') {
			// have to do another pr to refactor this with existsSync(path)
			// and remove these try catch blocks...
			require(path.join(process.cwd(), opts.packagePath, 'package.json'));
			packagePath = path.join(process.cwd(), opts.packagePath);
		}
	} catch(ex) {
		let errorMessage = ex.toString();
		if (ex.code === 'MODULE_NOT_FOUND' &&
			errorMessage.indexOf('package.json') > -1) {
			errorMessage =
				'Could not find package.json at custom path: ' +
				path.join(process.cwd(), opts.packagePath, 'package.json');
		}
		errCallback(new Error(errorMessage));
	}

	watchFile(packagePath);

	jspm.setPackagePath(packagePath);

	const jasmine = new Jasmine();

	const jasmineConfig = getJasmineConfig(opts.jasmineConfig)

	const specDir = jasmineConfig.spec_dir || '';
	const specFiles = jasmineConfig.spec_files;
	delete jasmineConfig.spec_files;
	const helpers = jasmineConfig.helpers;
	delete jasmineConfig.helpers;

	const watchFilesGlobs = opts.watchFiles || [];

	if (opts.reporter) {
		if (!Array.isArray(opts.reporter)) {
			opts.reporter = [opts.reporter];
		}
		opts.reporter.forEach((reporter) => {
			jasmine.addReporter(reporter);
		})
	}

	const baseURL = (function getBaseURL() {
		const sysPathOnly = System.getConfig().baseURL.replace(/^file:\/\//, ''); //isolate the path from URL
		const sysPath = path.normalize(sysPathOnly).replace(/^\\/,''); //fixes path for Windows
		const jspmPath = path.dirname(process.env.jspmConfigPath);
		const base = path.relative(jspmPath, sysPath);
		return (base.length !== 0) ?
			`${base}/` : base;
	})();

	function fileWatchAndImport(file) {
		watchFile(file);
		return SystemJS.import(file.slice(baseURL.length));
	}

	try {
		const systemInstantiate = SystemJS.instantiate;

		if (opts.coverage) {
			opts.coverage.dir = opts.coverage.dir || 'coverage';

			if (opts.coverage.cleanDir) {
				rimraf.sync(path.join(process.cwd(), opts.coverage.dir));
			}

			const coverageFiles = {};
			let atLeastOneCoverageFile = false;
			const coverageFilesGlobs = opts.coverage.files || [];
			if (!Array.isArray(coverageFilesGlobs) || coverageFilesGlobs.length === 0) {
				console.log(chalk.yellow(`Not capturing coverage because opts.coverage.files is not a valid array of globs. Also try the '--coverage-files <glob>' command line opt`));
			}
			opts.coverage.files.forEach(pattern => {
				glob.sync(path.join(process.cwd(), pattern))
				.forEach(file => {
					let isSpec = false;
					specFiles.forEach(specFileGlob => {
						isSpec = isSpec || minimatch(file, path.join(process.cwd(), specDir, specFileGlob));
					});

					let isHelper = false;
					helpers.forEach(helperGlob => {
						isHelper = isHelper || minimatch(file, path.join(process.cwd(), specDir, helperGlob));
					});

					if (!isSpec && !isHelper) {
						const fileKey = getFileKey(getOSFilePath(file), process.cwd());
						coverageFiles[fileKey] = 1;
						atLeastOneCoverageFile = true;
					}
				});
			});

			if (!atLeastOneCoverageFile) {
				console.log(chalk.yellow(`No coverage will be reported, since no files matched the patterns ${opts.coverage.files}`));
				console.log(chalk.yellow(`Be sure to provide opts.coverage.files if using the JS API, or --coverage-files <pattern> if using the CLI. Also, be sure to put the pattern in quotes to avoid the glob being expanded before jspmjasmine executes.`));
			}

			// create systemjs hook to allow Istanbul to instrument transpiled sources
			const instrument = new Instrumenter();
			const tempDirectory = path.join(__dirname, '../transpiled-modules/');
			// "instantiate" is the hook that provides the transpiled source
			SystemJS.instantiate = function(load) {
				// no need to slow things down for setting up the watcher files
				setTimeout(() => {
					const cwdIndex = load.address.indexOf(process.cwd());
					const relativeFilepath = cwdIndex >= 0 ? load.address.substring(cwdIndex + process.cwd().length + 1) : load.address;
					coverageFilesGlobs.forEach(glob => {
						if (minimatch(relativeFilepath, glob)) {
							watchFile(relativeFilepath);
						}
					});

					watchFilesGlobs.forEach(glob => {
						if (minimatch(relativeFilepath, glob)) {
							watchFile(relativeFilepath);
						}
					});
				});

				try {
					// create a unique key to store the sources of modules for the browser
					const fileKey = getFileKey(getOSFilePath(load.address), process.cwd());
					// exclude the dependency modules (i.e. libraries) from instrumentation
					if (coverageFiles[fileKey]) {
						mkdirp.sync(tempDirectory + fileKey.substring(0, fileKey.lastIndexOf('/')));
						// put file's transpiled counterpart in temp folder
						let filename;
						let sourceMap = '';

						// arrange sourcemaps
						if (load.metadata.sourceMap) {
							filename = path.join(tempDirectory, fileKey);
							// keeping sourcesContent causes duplicate reports
							delete load.metadata.sourceMap.sourcesContent;
							// this is the file being "instrumented"
							load.metadata.sourceMap.file = filename;
							// removing "file://" from paths
							load.metadata.sourceMap.sources = load.metadata.sourceMap.sources.map(
								filename => getOSFilePath(filename)
							);
							// inlined-sourceMap to be added to file
							sourceMap = '\n' + inlineSourceMap(load.metadata.sourceMap);
						} else if (load.source.trim() === fs.readFileSync(getOSFilePath(load.address), 'utf8').trim()) {
							// actual file source is the same as load.source
							// let the original file through
							filename = getOSFilePath(load.address);
						} else {
							// there is no source, but is transpiled, so we have no choice but to
							// create a temp file that cannot be mapped back to the original
							// The goal is to not die when there is not a source map
							filename = path.join(tempDirectory, fileKey);
						}

						if (filename !== getOSFilePath(load.address)) {
							// write transpiled file with to temp directory
							fs.writeFileSync(filename, load.source + sourceMap);
						}

						// instrument file with istanbul
						load.source = instrument.instrumentSync(
							load.source,
							// make the path-like file key into something that can be used as a name
							filename
						)
						// files that are not included as dependencies in the spec
						// still need to be evaluated. So here, we're going to exclude
						// files that are already being imported by the specs, leaving
						// only files that were not imported present in the "coverageFiles",
						// which will then be imported (evaluated) when the tests conclude.
						delete coverageFiles[fileKey]
					}
				} catch (ex) {
					errCallback(ex)
				}
				// call the original "instantiate" hook function
				return systemInstantiate.call(SystemJS, load)
			}

			// storing related variables in the "opts.coverage" object to avoid
			// having to pass more arguments to the "importTestFiles" function
			opts.coverage.coverageFiles = coverageFiles
			opts.coverage.tempDirectory = tempDirectory

			// create temp directory
			if (fs.existsSync(tempDirectory)) {
				rimraf.sync(tempDirectory)
			}
			fs.mkdirSync(tempDirectory)
		} else {
			SystemJS.instantiate = function(load) {
				// no need to slow things down for setting up the watcher files
				setTimeout(() => {
					const cwdIndex = load.address.indexOf(process.cwd());
					const relativeFilepath = cwdIndex >= 0 ? load.address.substring(cwdIndex + process.cwd().length + 1) : load.address;

					watchFilesGlobs.forEach(glob => {
						if (minimatch(relativeFilepath, glob)) {
							watchFile(relativeFilepath);
						}
					});
				});

				return systemInstantiate.apply(this, arguments);
			}
		}

		/* Mocker.init overwrites System.instantiate again, and we want it 
		 * to do that *after* we've already overwritten System.instantiate for
		 * coverage purposes. That way, the mocker instantiate will run first,
		 * followed by the coverage instantiate (this is important because 
		 * when we run istanbul.instrumentSync() the source maps are definitely
		 * lost).
		 */
		Mocker.init(opts, SystemJS);
		jasmine.loadConfig(jasmineConfig);

		// We should maybe start passing in a the config object...
		const importTheseTestFiles = importTestFiles.bind(
			null,
			fileWatchAndImport,
			jasmine,
			specDir,
			specFiles,
			opts.coverage,
			errCallback,
			timer
		);

		// helpers
		let numHelperGlobsLeft = helpers && helpers.length ? helpers.length : 0;
		if (numHelperGlobsLeft === 0) {
			importTheseTestFiles();
		} else {
			helpers.forEach(helperPattern => {
				glob('spec/' + helperPattern, {}, function(err, files) {
					if (err) {
						throw err;
					}
					Promise
					.all(files.map(fileWatchAndImport))
					.then(() => Promise.all(global.helperPromises))
					.then(() => {
						if (--numHelperGlobsLeft === 0) {
							importTheseTestFiles();
						}
					})
					.catch((ex) => {
						if (opts.coverage && opts.coverage.tempDirectory) {
							// remove temporary directory
							rimraf.sync(opts.coverage.tempDirectory)
						}
						errCallback(ex)
					});
				});
			});
		}
	} catch(ex) {
		if (opts.coverage && opts.coverage.tempDirectory) {
			// remove temporary directory
			rimraf.sync(opts.coverage.tempDirectory)
		}
		errCallback(new Error(`Jasmine or Jspm may not be properly configured -- '${ex.toString()}'`));
	}
}

function importTestFiles(fileWatchAndImport, jasmine, specDir, specFiles, coverage, errCallback, timer) {

	// the "onComplete" hook to prevent jasmine's self-righteous exit
	jasmine.onComplete(function (passed) {
		// avoid misalignment with jasmine's output
		console.log('');

		console.log(chalk[passed ? 'green' : 'red'](`Tests have ${passed ? 'passed' : 'failed'}`));

		if (coverage) {
			console.log(chalk.blue(`Calculating coverage for all untested files`));
			// import the rest of the modules not already imported (evaluated)
			// as dependencies of specs
			Promise
			.all(Object.keys(coverage.coverageFiles).map(fileWatchAndImport))
			.then(function () {
				let coverageSucceeded = false;
				const coverageReporter = coverage.reporter || 'html';
				if (typeof __coverage__ === 'undefined') {
					console.log(chalk.yellow("No coverage was collected for files matching globs " + coverage.files));
				} else {
					try {
						const collector = remap(__coverage__)
						let report = Report.create(coverageReporter, {dir: coverage.dir});
						report.writeReport(collector, true);
						report = Report.create('text-summary');
						report.writeReport(collector, true);
						coverageSucceeded = true;
					} catch (ex) {
						console.log(chalk.red(ex.stack ? ex.stack : ex));
					}
				}
				// remove temporary directory
				rimraf.sync(coverage.tempDirectory);

				if (coverageSucceeded) {
					if (coverageReporter === 'html') {
						console.log(chalk.green(`\nCode coverage html report is in directory '${coverage.dir}'`));
					}
				} else {
					console.log(chalk.yellow(`Failed to generate coverage because of an error that occurred within remap-istanbul or istanbul. Not failing tests because this isn't your fault`));
				}
				finishTestRun(passed, jasmine, errCallback);
			}).catch((ex) => {
				// remove temporary directory
				rimraf.sync(coverage.tempDirectory);

				// this is the exit strategy inside Jasmine, it takes care
				// of cross platform exit bugs
				const safeExit = () => jasmine.exit(1, process.platform, process.version, process.exit, jasmine.exit);
				errCallback(ex, safeExit, "Error occurred when importing all coverage files that were not already imported when the tests ran");
			});
		} else {
			finishTestRun(passed, jasmine, errCallback);
		}
	});

	let numSpecGlobsLeft = specFiles.length || 0;
	if (numSpecGlobsLeft === 0) {
		jasmine.execute();
	} else {
		specFiles.forEach(globPattern => {
			glob(specDir + '/' + globPattern, {}, function(err, files) {
				if (err) {
					throw err;
				}
				Promise
				.all(files.map(fileWatchAndImport))
				.then(() => {
					if (--numSpecGlobsLeft === 0) {
						jasmine.execute();
					}
				})
				.catch((ex) => {
					if (coverage && coverage.tempDirectory) {
						// remove temporary directory
						rimraf.sync(coverage.tempDirectory);
					}
					errCallback(ex);
				});
			});
		});
	}
}

function getOSFilePath(filename) {
	// might need to be more robust in the future
	return filename.replace('file://', '')
}

function getFileKey(filename, basePath) {
	if(!basePath) throw new Error('Please supply a base path!')
	return filename.replace(basePath + '/', '')
}

function getJasmineConfig(config) {
	if (typeof config === 'object') {
		return config;
	}

	let jasmineConfigLocation;

	if (typeof config === 'string') {
		jasmineConfigLocation = path.join(process.cwd(), config);
	} else {
		// Default location is provided by "jasmine init"
		jasmineConfigLocation = path.join(process.cwd() + '/spec/support', 'jasmine.json');
	}
	watchFile(jasmineConfigLocation);

	/* We have to mutate the jasmine config before actually giving it to jasmine.
	 * Not using the original config ensures that it isn't corrupted for subsequent
	 * test runs.
	 */
	const originalJasmineConfig = require(jasmineConfigLocation);
	return { ...originalJasmineConfig };
}

function finishTestRun(passed, jasmine, errCallback) {
	notifyWatcherFinishedTestRun();
	if (!isWatching()) {
		const exitCode = passed ? 0 : 2;

		const successResult = null;
		
		// this is the exit strategy inside Jasmine, it takes care
		// of cross platform exit bugs
		const safeExit = () => jasmine.exit(exitCode, process.platform, process.version, process.exit, jasmine.exit);

		errCallback(successResult, safeExit);
	}
}
