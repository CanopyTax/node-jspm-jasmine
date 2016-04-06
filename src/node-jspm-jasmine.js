import glob from "glob";
import fs from "fs";
import jspm from "jspm";
import path from "path";
import Jasmine from "jasmine";

export function runTests(opts, errCallback = function() {}) {

	let packagePath = '.';

	try {

		if ( typeof opts.packagePath === 'string' ) {
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
	// For middleware
	global.System = SystemJS;

	try {

		const jasmineConfig =
			( typeof opts.jasmineConfig === 'object' ?
				opts.jasmineConfig :
				require(
					path.join(
						( typeof opts.jasmineConfig === 'string' ?
							opts.jasmineConfig :
							process.cwd() + '/spec/support'
						),
						'jasmine.json'
					)
				)
			);
		const specDir = jasmineConfig.spec_dir;
		const specFiles = jasmineConfig.spec_files;
		delete jasmineConfig.spec_files;
		const helpers = jasmineConfig.helpers;
		delete jasmineConfig.helpers;

		jasmine.loadConfig(jasmineConfig);

		const importTheseTestFiles = importTestFiles.bind(null, SystemJS, jasmine, specDir, specFiles, errCallback);

		// helpers
		let numHelperGlobsLeft = helpers.length || 0;

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
		errCallback(new Error(`Jasmine or Jspm may not be properly configured -- '${ex.toString()}'`));
	}
}

function importTestFiles(SystemJS, jasmine, specDir, specFiles, errCallback) {
	let numSpecGlobsLeft = specFiles.length || 0;

	if (numSpecGlobsLeft === 0) {
		//nothing to do anyways??
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
				.catch(errCallback);
			});
		});
	}
}
