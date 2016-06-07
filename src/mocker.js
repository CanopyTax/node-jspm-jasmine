import { partial } from 'lodash';
import minimatch from 'minimatch';
import sourceMap from 'source-map';
const { SourceNode, SourceMapConsumer } = sourceMap;

let globalValues, lastGlobalValueId, opts;

export function init(_opts, SystemJS) {
	global.mockModules = mockModules;
	global.mockGlobals = mockGlobals;
	global.mockedGlobals = {};

	// SystemJS.instantiate is overwritten for mocking globals.
	SystemJS.instantiate = partial(customInstantiate, SystemJS.instantiate);
	globalValues = [];

	/* This is just an integer that gets incremented each time that mockGlobals is called.
	 * It ensures that if you call `mockGlobals` multiple times for the same global value
	 * but for different file glob patterns, that both can still be respected.
	 */
	lastGlobalValueId = -1;
	opts = _opts;
}

/* moduleMap is an object whose keys are module names and whose values are objects
 * where the keys are export names and the values are whatever the exported value is.
 *
 * To export a default value, create a `default` property that is exported.
 */
function mockModules(moduleMap) {
	if (typeof moduleMap !== 'object') {
		throw new Error(`mockModules must be given an object as the first parameter, where the object keys are module names and the values are the mocked values`);
	}

	for (let moduleName in moduleMap) {
		if (typeof moduleMap[moduleName] !== 'object') {
			throw new Error(`Cannot mock '${moduleName}' -- value to mock with is not an object`);
		}

		/* helperPromises is defined in ./node-jspm-jasmine.js. The tests will not
		 * run until all helperPromises have been resolved or rejected.
		 */
		global
		.helperPromises
		.push(
			SystemJS
			.normalize(moduleName)
			.then(normalized => {
				if (SystemJS.has(normalized)) {
					SystemJS.delete(normalized);
				}

				SystemJS
				.register(normalized, [], (_export, _context) => {
					return {
						setters: [],
						execute() {
							for (let exportName in moduleMap[moduleName]) {
								// if exportName is default, export it as default
								_export(exportName, moduleMap[moduleName][exportName]);
							}
						}
					};
				});
			})
		);
	}
}

/* globs: one or more file glob patterns for which to mock the globals.
 * globalMap: an object whose keys are the names of global variables and
 * whose values are the values.
 */
function mockGlobals(globs, globalMap) {
	if (typeof globs === 'string') {
		globs = [globs];
	}

	if (!Array.isArray(globs) || globs.length === 0 || globs.some(glob => typeof glob !== 'string')) {
		throw new Error(`mockGlobals must be called with its first argument being either a string glob or an array of string globs`);
	}

	if (typeof globalMap !== 'object') {
		throw new Error(`mockGlobals must be called with its second argument being an object whose keys are global variable names and whose values are the mocked values`);
	}

	const globalValue = {
		globs,
		globalMap,
		id: ++lastGlobalValueId,
	};

	/* Our approach to mocking globals is to alter the source of the affected files to 
	 * add a variable declaration at the top of the file that represents the "global"
	 * variable. The varDeclarations is a string that will be used in that process
	 * for all files that need these specific mocked globals.
	 */
	globalValue.varDeclarations = getVarDeclarations(globalValue);

	globalValues.push(globalValue);
}

/* We overwrite System.instantiate because we need to alter the transpiled code
 * to add in variables that represent any applicable "mocked" globals.
 */
function customInstantiate(originalInstantiate, load) {
	const index = load.address.indexOf(process.cwd());
	let relativeFilepath = index >= 0 ? load.address.substring(index + process.cwd().length + 1) : load.address;

	const globalValue = globalValues.find(globalValue => {
		return globalValue.globs.some(glob => minimatch(relativeFilepath, glob));
	});

	if (globalValue) {
		if (!global.mockedGlobals[globalValue.id]) {
			global.mockedGlobals[globalValue.id] = globalValue.globalMap;
		}

		if (load.metadata.sourceMap) {
			try {
				/* We need to add some variables to the transpiled code in order to simulate
				 * the effect of having a "global" variable.
				 */
				const sourceMapConsumer = new SourceMapConsumer(load.metadata.sourceMap);
				const sourceNode = SourceNode.fromStringWithSourceMap(load.source, sourceMapConsumer);
				sourceNode.prepend(`(function nodeJspmJasmineGlobalsMocked() {\n${globalValue.varDeclarations}`);
				sourceNode.add(`\n})()`);
				const newSource = sourceNode.toStringWithSourceMap();
				load.source = newSource.code;
				load.metadata.sourceMap = JSON.parse(JSON.stringify(newSource.map));
			} catch (ex) {
				/* Source map stuff sometimes throws exceptions, but we don't want the tests
				 * to fail in that case. Instead of dying completely, just warn about the coverage
				 * html report potentially being incorrect.
				 */
				if (opts.coverage && opts.coverage.files.some(glob => minimatch(relativeFilepath, load.address))) {
					console.warn(`The html coverage report for '${load.address}' will be incorrect because of a sourcemapping error when mocking globals`, ex);
				}

				// Still mock the global, just with the source map being messed up
				addGlobalsNoSourceMap(globalValue, load);
			}
		} else {
			if (opts.coverage && opts.coverage.files.some(glob => minimatch(relativeFilepath, load.address))) {
				console.warn(`The html coverage report for '${load.address}' will be incorrect because systemjs did not create a source map for that file`);
			}

			// Even if there isn't a source map, we want the global to be mocked.
			addGlobalsNoSourceMap(globalValue, load);
		}

	}

	return originalInstantiate.call(this, load);
}

function addGlobalsNoSourceMap(globalValue, load) {
	/* The best we can do is to not create new lines because those hurt coverage reports a lot.
	*/
	const prefix = `(function nodeJspmJasmineGlobalsMocked() {`;
	const suffix = `\n})()`;

	const lastOneLineComment = load.source.lastIndexOf('//');
	if (lastOneLineComment > load.source.lastIndexOf('\n')) {
		// we need to end the iife on the line before the comment.
		load.source = prefix + globalValue.varDeclarations + load.source.slice(0, lastOneLineComment) + suffix + load.source.slice(lastOneLineComment);
	} else {
		// we can end the iiefe after all the code.
		load.source = prefix + globalValue.varDeclarations + load.source + '\n})()';
	}
}

function getVarDeclarations({globalMap, id}) {
	let str = 'var', prefix = ' ';
	for (let globalName in globalMap) {
		str += `${prefix}${globalName} = global.mockedGlobals[${id}]['${globalName}']`;
		prefix = ', ';
	}
	str += ';';

	return str === 'var;' ? '' : str;
}
