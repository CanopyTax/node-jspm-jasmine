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

import Timer from './timer.js';

export function runTests(opts, errCallback = function() {}) {
	const timer = Timer.start();

	const originalErrCallback = errCallback;
	errCallback = function() {
		const testTime = Date.now() - testStartTime;

		timer.finish();

		return originalErrCallback.apply(this, arguments);
	}

	global.System = global.SystemJS = SystemJS; // For middleware

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

	jspm.setPackagePath(packagePath);

	const jasmine = new Jasmine();
	const SystemJS = new jspm.Loader();

	const jasmineConfig = getJasmineConfig(opts.jasmineConfig)
	const specDir = jasmineConfig.spec_dir || '';
	const specFiles = jasmineConfig.spec_files;
	delete jasmineConfig.spec_files;
	const helpers = jasmineConfig.helpers;
	delete jasmineConfig.helpers;

	try {
		if (opts.coverage) {
			opts.coverage.dir = opts.coverage.dir || 'coverage';

			if (opts.coverage.cleanDir) {
				rimraf.sync(path.join(process.cwd(), opts.coverage.dir));
			}

			const coverageFiles = {};
			let atLeastOneCoverageFile = false;
			const coverageFilesGlobs = opts.coverage.files || [];
			if (!Array.isArray(coverageFilesGlobs) || coverageFilesGlobs.length === 0) {
				console.log(`Not capturing coverage because opts.coverage.files is not a valid array of globs. Also try the '--coverage-files <glob>' command line opt`);
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
				console.log(`No coverage will be reported, since no files matched the patterns ${opts.coverage.files}`);
				console.log(`Be sure to provide opts.coverage.files if using the JS API, or --coverage-files <pattern> if using the CLI. Also, be sure to put the pattern in quotes to avoid the glob being expanded before jspmjasmine executes.`);
			}

			// create systemjs hook to allow Istanbul to instrument transpiled sources
			const instrument = new Instrumenter();
			const systemInstantiate = SystemJS.instantiate;
			const tempDirectory = path.join(__dirname, '../no-source-map/');
			// "instantiate" is the hook that provides the transpiled source
			SystemJS.instantiate = function(load) {
				try {
					// create a unique key to store the sources of modules for the browser
					const fileKey = getFileKey(getOSFilePath(load.address), process.cwd());
					// exclude the dependency modules (i.e. libraries) from instrumentation
					if (coverageFiles[fileKey]) {
						// put file's transpiled counterpart in temp folder
						let filename;
						let sourceMap = '';
						// arrange sourcemaps
						if (load.metadata.sourceMap) {
							filename = path.join(tempDirectory, fileKey.replace(/\//g, '|'));
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
							// I think that we should throw an error here, telling the user to figure out
							// why it is that no sourcemap is being generated.
							filename = path.join(tempDirectory, fileKey.replace(/\//g, '|'));
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
		}

		jasmine.loadConfig(jasmineConfig);

		// We should maybe start passing in a the config object...
		const importTheseTestFiles = importTestFiles.bind(
			null,
			SystemJS,
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
					.all(files.map(file => SystemJS.import(file)))
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

function importTestFiles(SystemJS, jasmine, specDir, specFiles, coverage, errCallback, timer) {

	if (coverage) {
		// the "onComplete" hook to prevent jasmine's self-righteous exit
		jasmine.onComplete(function (passed) {
			// avoid misalignment with jasmine's output
			console.log('');

			console.log(chalk[passed ? 'green' : 'red'](`Tests have ${passed ? 'passed' : 'failed'}`));
			console.log(`Calculating coverage for all untested files`);
			// import the rest of the modules not already imported (evaluated)
			// as dependencies of specs
			Promise.all(Object.keys(coverage.coverageFiles).map(function (file) {
				return SystemJS.import(path.join(process.cwd(), file));
			})).then(function () {
				const coverageReporter = coverageReporter || 'html';
				if (typeof __coverage__ === 'undefined') {
					console.log("No coverage was collected for files matching globs " + coverage.files);
				} else {
					try {
						const collector = remap(__coverage__)
						let report = Report.create(coverageReporter, {dir: coverage.dir});
						report.writeReport(collector, true);
						report = Report.create('text-summary');
						report.writeReport(collector, true);
					} catch (ex) {
						errCallback(ex);
					}
				}
				// remove temporary directory
				rimraf.sync(coverage.tempDirectory);

				if (coverageReporter === 'html') {
					console.log(`\nCode coverage html report is in directory '${coverage.dir}'`);
				}
				timer.finish();

				// this is the exit strategy inside Jasmine, it takes care
				// of cross platform exit bugs
				const exitCode = passed ? 0 : 2;
				jasmine.exit(exitCode, process.platform, process.version, process.exit, jasmine.exit);
			}).catch((ex) => {
				// remove temporary directory
				rimraf.sync(coverage.tempDirectory);
				errCallback(ex);
				// this is the exit strategy inside Jasmine, it takes care
				// of cross platform exit bugs
				jasmine.exit(1, process.platform, process.version, process.exit, jasmine.exit);
			});
		});
	}

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
				.all(files.map(file => SystemJS.import(file)))
				.then(() => {
					if (--numSpecGlobsLeft === 0) {
						jasmine.execute();
					}
				})
				.catch((ex) => {
					// remove temporary directory
					rimraf.sync(coverage.tempDirectory);
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
	if (typeof config === 'string') {
		return require(path.join(process.cwd(), config));
	}
	// Default location is provided by "jasmine init"
	return require(path.join(process.cwd() + '/spec/support', 'jasmine.json'));
}
