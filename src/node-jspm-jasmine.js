import glob from "glob";
import fs from "fs";
import jspm from "jspm";
import path from "path";
import minimatch from 'minimatch';
import Jasmine from "jasmine";
import { Instrumenter, Report, Collector } from 'istanbul';
import { remap, writeReport } from "remap-istanbul";
import inlineSourceMap from "inline-source-map-comment";

const coveredModules = [];
const tranpiledFileSuffix = '__node-jspm-jasmine-transpiled__.js';

export function runTests(opts, errCallback = function() {}) {

	global.System = SystemJS; // For middleware

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
	const Instrument = new Instrumenter();
	const systemInstantiate = SystemJS.instantiate;

	const jasmineConfig = getJasmineConfig(opts.jasmineConfig)
	const specDir = jasmineConfig.spec_dir;
	const specFiles = jasmineConfig.spec_files;
	delete jasmineConfig.spec_files;
	const helpers = jasmineConfig.helpers;
	delete jasmineConfig.helpers;

	try {
		if ( opts.coverage ) {
			opts.coverage.dir = opts.coverage.dir || 'coverage';
			const coverageFiles = {};
			const coverageFilesGlobs = opts.coverage.files || [];
			if (!Array.isArray(coverageFilesGlobs) || coverageFilesGlobs.length === 0) {
				console.log(`Not capturing coverage because opts.coverage.files is not a valid array of globs. Also try the '--coverage-files <glob>' command line opt`);
			}
			opts.coverage.files.forEach( pattern => {
				glob.sync(path.join(process.cwd(), pattern))
				.forEach(file => {
					let isSpec = false;
					specFiles.forEach(specFileGlob => {
						isSpec = isSpec || minimatch(file, specFileGlob);
					});

					let isHelper = false;
					helpers.forEach(helperGlob => {
						isHelper = isHelper || minimatch(file, helperGlob);
					});

					if (!isSpec && !isHelper) {
						coverageFiles[file] = 1;
					}
				});
			});
			SystemJS.instantiate = (load) => {
				const normalizedAddress = getOSFilePath(load.address)
				if (coverageFiles[normalizedAddress]) {
					load.address = normalizedAddress;
					coveredModules.push(load.address);
					if ( load.metadata.sourceMap ) {
						delete load.metadata.sourceMap.sourcesContent;
						load.metadata.sourceMap.file = load.address + tranpiledFileSuffix
						load.metadata.sourceMap.sources = load.metadata.sourceMap.sources.map(
							filename => getOSFilePath(filename)
						)
						fs.writeFileSync(
							load.address + tranpiledFileSuffix,
							load.source  + '\n' + inlineSourceMap(load.metadata.sourceMap)
						)
					}
					load.source = Instrument.instrumentSync(
						load.source,
						load.address + tranpiledFileSuffix
					)
				}
				return systemInstantiate.call(SystemJS, load);
			}
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
			errCallback
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
					.catch(errCallback);
				});
			});
		}
	} catch(ex) {
		removeTempFiles();
		errCallback(new Error(`Jasmine or Jspm may not be properly configured -- '${ex.toString()}'`));
	}
}

function importTestFiles(SystemJS, jasmine, specDir, specFiles, coverage, errCallback) {
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
						jasmine.env.addReporter({
						    jasmineDone: function () {
						    	if (coverage) {
						    		// avoid misalignment with jasmine's output
						    		console.log('')
						    		const collector = remap(__coverage__)
									let report = Report.create(
										(coverage.reporter || 'html'),
										{
											dir: coverage.dir
										}
									);
									report.writeReport(collector, true);
									report = Report.create('text', {maxCols: 70});
									report.writeReport(collector, true);
									report = Report.create('text-summary');
									report.writeReport(collector, true);
									// remove temporary "transpiled" files
									removeTempFiles();
								}
						    }
						});
						jasmine.execute();
					}
				})
				.catch(errCallback);
			});
		});
	}
}

function removeTempFiles() {
	coveredModules.forEach(filename => {
		fs.unlink(
			filename + tranpiledFileSuffix,
			removeTempFileCallback
		);
	});
}
function removeTempFileCallback(err) {
	if ( err ) {
		throw new Error(
			'Failed to remove temporary ' +
			'file "' + filename + '". ' +
			'Please remove it manually.'
		);
	}
}
function getOSFilePath(filename) {
	// might need to be more robust in the future
	return filename.replace( 'file://', '' )
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
