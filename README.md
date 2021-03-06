# node-jspm-jasmine
Run jasmine tests on a jspm project, without karma or phantomjs. Keep your existing `jasmine.json`, `config.js`, and `jspm_packages`. The hope is that everything will just "work out of the box".
Includes no-setup-required [code coverage](/README.md#--coverage), [mocking of modules](/README.md#mockmodules), and even ability to [mock `window`, `document`, and other globals](/README.md#mockglobals).

## Quickstart
Run the following commands, and you're all done.
```bash
npm install --save-dev jspm jasmine node-jspm-jasmine
npm install -g jspm jasmine node-jspm-jasmine
jspm init
jasmine init
jspmjasmine
```

You'll probably want to add a `test` script to your package.json `scripts` with the command being `jspmjasmine`. After you do so, you can run the tests with the normal `npm test`. Example:

```json
{
  "name": "name-of-package",
  "scripts": {
    "test": "jspmjasmine"
  }
}
```

## CLI
node-jspm-jasmine exposes a cli that is accessible through the `jspmjasmine` command. All [jasmine configuration options](http://jasmine.github.io/2.4/node.html#section-Configuration) will be respected, with all `helpers` and `spec_files` being loaded via JSPM instead of node's `require` function. Your tests will be run in an environment in which they will be able to call `describe`, `it`, `System.import`, etc.

You can also run `jspmjasmineinspect` in order to debug the NodeJS tests inside of the chrome dev tools. `jspmjasmineinspect` is exactly the same as `jspmjasmine`, except it adds the `--inspect` flag to node so that you can debug
it in chrome dev tools. See this [explanation of Node debugging](https://mattdesl.svbtle.com/debugging-nodejs-in-chrome-devtools).

### Options:

#### `--coverage`
Add a coverage report that will be generated for all files imported by your tests. The coverage report will be generated by  [istanbul](https://github.com/gotwarlost/istanbul) and [remap-istanbul](https://github.com/SitePen/remap-istanbul), and will by default be an html report put into a `coverage/` directory.
```bash
jspmjasmine --coverage
```

#### `--coverage-files <glob-pattern>`
Provide a pattern of files for which to generate coverage reports. This allows you to calculate coverage for files that are not included by default when you use `--coverage` and is helpful if you want to know the coverage for all source files, including those that are not tested.

*Notes:*
- You may provide multiple glob patterns by using the --coverage-files option more than once.
- Using this option without using the `--coverage` option does nothing.
```bash
jspmjasmine --coverage --coverage-files 'src/**/*.js' --coverage-files 'src/**/*.jsx'
````

#### `--coverage-reporter <reporter>`
Specify a custom coverage reporter, defaulting to `html` reporter if not specified. This option does nothing unless you also use the `--coverage` option. The available reporters are all of them that are [supported by istanbul](https://github.com/gotwarlost/istanbul/tree/master/lib/report). This includes
- clover
- cobertura
- html
- json-summary
- json
- lcov
- lcovonly
- teamcity
- text-lcov
- text-summary
- text
```bash
jspmjasmine --coverage --coverage-reporter json
```

#### `--coverage-dir <relative-path>`
Provide a custom directory in which to put coverage reports. The provided path should be relative to the current working directory. If the directory does not exist, it will be created recursively. If this option is omitted, coverage reports will be put into a `./coverage/` directory by default.
```bash
jspmjasmine --coverage --coverage-dir 'htmlreports/'
```

#### `--clean-coverage-dir`
Istanbul coverage reports are such that previous test runs may linger around in the coverage reports directory. If you want to clean up previous test coverage results before creating the new coverage reports, then use this option.
```bash
jspmjasmine --coverage --clean-coverage-dir
```

#### `--watch` or `-w`
Automatically re-run tests when files change. This means that when you run `jspmjasmine` that the process will not terminate, but instead wait for files to change. By default, the files that will be watched are all jasmine helper files, the jasmine.json file, and any spec files as configured in the jasmine.json file. If you want to customize the files being watched beyond that, try out the `--watch-files` option.
```bash
jspmjasmine --watch
jspmjasmine -w
```
#### `--watch-files <glob-pattern>`
Configure the test watcher to re-run tests when specific files change. Use a [glob pattern](https://www.npmjs.com/package/glob#glob-primer) to control which files will be watched and which ones won't. Also, the default files to be watched will be watched regardless of the --watch-files glob patterns that are specified. See the documentation for --watch to see which files will be watched by default.
*Notes:*
- The default watched files will be watched no matter what, even if --watch-files glob patterns do not match those files. See the documentation for --watch for an explanation of the default watched files.
- You can specify more than one glob pattern by using the `--watch-files` option more than once.
- If you use --watch-files, it is not necessary to also use --watch.
```bash
jspmjasmine --watch-files 'src/**/*.js' --watch-files 'src/**/*.css'
```

#### `--jasmine-config <relative-path>`
Provide a custom path to the jasmine.json config file. The provided path should be a relative path from the current working directory. If not provided, this will default to the cwd + `spec/support/jasmine.json`
```bash
jspmjasmine --jasmine-config 'tests/jasmine.json'
```

#### `--package-path <relative-path>`
Provide a custom directory to use as the base directory where jspm will find the package.json. The provided path should be a relative path from the current working directory. If not provided, this defaults to the current working directory.
```bash
jspmjasmine --package-path 'sub-project/'
```

## JS API
node-jspm-jasmine exports named exports which are to be used as a js library. Example:
```js
import * as nodeJspmJasmine from 'node-jspm-jasmine';
nodeJspmJasmine.
({});
```

#### runTests(opts, errBack)
This will run your jasmine tests, loading all the tests with JSPM instead of node's `require`. 

##### Options:
The first arguments are options that you would pass to jspm-jasmine similar to the CLI.

```js
runTests({

  // Provide a custom jasmine.json config file
  // Defaults to path where `jspmjasmine` is being executed + `/spec/support/jasmine.json
  jasmineConfig: "RELATIVE/PATH/TO/jasmine.json",
  // Alternatively, you can pass the jasmine config object directly.
  // jasmineConfig: {
    // "spec_dir": "src/test/specs",
    // "spec_files": ["**/*.js"],
    // "helpers": []
  // },

  // Provide a custom directory to package.json
  // Defaults to path where `jspmjasmine` is being executed
  packagePath: "RELATIVE/PATH/TO/PACKAGE/JSON/DIRECTORY/",

  // Provide custom reporters
  // If you add a reporter, the default ConsoleReporter will not be added
  reporter: new CustomReporterClass()
  // You can also pass multiple custom reporters
  // reporter: [new CustomReporterClass1(), new CustomReporterClass2(), ...]

  // Add a coverage report
  // Defaults to undefined
  coverage: {

    // Provide a custom directory for storing coverage reports
    // Defaults to "./coverage/"
    dir: "RELATIVE/PATH/TO/COVERAGE/DIRECTORY/",

    // Provide a custom type for coverage reports
    // Defaults to "html" (all report types shipped with Istanbul are supported)
    reporter: "TYPE",

    // Provide files to be instrumented by Istanbul coverage
    // Defaults empty array (no files)
    // If also in watch mode, all coverage files will be automatically watched
    files: "RELATIVE/GLOB/PATH/TO/FILES/**/*.js",

    // Allow `node-jspm-jasmine` to empty coverage directory before creating a new report
    // Defaults to undefined (no clean up)
    cleanDir: true
  },

  // Rerun tests whenever files change. This option is presumed to be "on"
  // if watchFiles is provided.
  watch: true,

  // This option allows you to watch specific files for changes when in watch mode
  // An array of globs must be provided, where any file matching the glob patterns
  // will be watched. Note that if you provide watchFiles that watch is assumed to be on.
  watchFiles: ["src/**/*.js", "another-glob*.js"],
})
```

##### Error Callback *(optional)*:
The second argument `errBack` is a function that is called when the tests either succeed or fail. If the tests succeed, `errBack` will be called with a `null` first argument. If they fail, `errBack` will be called with a reason why the tests failed. 

```js
runTests(opts, function(err) {
  if (err) {
    console.error(err);
  } else {
    console.log("tests passed");
  }
}
```

jspm-jasmine already provides a default `errBack` function which is adequate under most circumstances. You need to provide an `errback` only if you wish to modify the default logging behaviour.

## mockModules
In order to mock or ignore files, you'll need to call the `mockModules` function which is defined on the global by
node-jspm-jasmine. You should do this before any of the test files are imported, so the best thing to do is
to create a [jasmine helper file](http://jasmine.github.io/2.4/node.html#section-12)
so that the mocking/ignoring is done before the tests are run. These files by default go into your `spec/helpers` directory,
but that can be controlled in the jasmine.json file (note that the file patterns that you put into the `helpers` array will
be relative to the `spec` directory itself, not the package's root directory nor the `spec/helpers` directory).
Once you've got a helper file, use the function `mockModules` (provided by node-jspm-jasmine on the `global`)

#### API:
`mockModules(moduleMap)`: `moduleMap` must be an object whose keys are un-normalized SystemJS dependency names,
and whose values are an export object. The keys of export objects are the names of exports and the values are
whatever you want to the exported value to be mocked as. In order to mock the default exported value of a module,
simply create a `default` property inside of the export object.

#### Example:
```js
// spec/helpers/mock-modules.js
mockModules({
	// 'name-of-dep' will be mocked everywhere with just an empty object
	'name-of-dep': {}, 

	'name-of-another-dep': {
		// default means that this will be mocked as the default export
		default: {
			foo: 'bar',
		},

		// a named export
		namedExport: "string!",
	},
});
```

## mockGlobals
In order to mock globals, you can either just put variables onto the `global`, or you can use node-jspm-jasmine's
`mockGlobals` function (which is exposed onto the `global` for you to use). The main benefit of using `mockGlobals`
is that you can mock the `window` without causing all your dependencies to freak out and think they're
in the browser, which is accomplished by controlling which files you mock the global variables for. It is highly
recommended that you call `mockGlobals` from inside of a [jasmine helper file](http://jasmine.github.io/2.4/node.html#section-12),
because node-jspm-jasmine needs to know what to mock and when before it runs any of the tests.

#### API:
`mockGlobals(glob, globalsMap)`:
  - `glob` must either be a single string glob pattern, or an array of string glob patterns.
    All files that match the glob pattern(s) will have access to the globals, and files that don't match will not have the
    globals.
  - `globalsMap` must be an object whose keys are the names of the globals to mock (must be valid javascript identifiers)
    and whose values are whatever you want the mocked values to be.

#### Example:
```js
// spec/helpers/mock-global.js
const whenToMock = [
	'src/**/*.js',
	'jspm_packages/**/single-spa-canopy.js',
];

const whatToMock = {
	window: {
		addEventListener() {},
		removeEventListener() {},
		document: {},
		Raven: {
			setExtraContext: jasmine.createSpy('Raven.setExtraContext'),
		},
	},

	document: {
		body: {
			removeEventListener() {},
		},
	},

	DOMParser: function() {
		this.parseFromString = () => {};
	},

	bannerIsShowing() {
		return true;
	},
}

mockGlobals(whenToMock, whatToMock);
```

## Usage with Enzyme
Although [Enzyme](http://airbnb.io/enzyme/) is not related to jspm or jasmine, the reason this project was started was to figure out an easy way to get a JSPM + React project to run tests with Jasmine and Enzyme. So here's how:

- Create a jasmine helper file, as explained [above](https://github.com/CanopyTax/node-jspm-jasmine#mockmodules)
- In the jasmine helper file, put the following (this works for react 15.0, see [enzyme's docs for webpack](https://github.com/airbnb/enzyme/blob/master/docs/guides/webpack.md) to find which specific things you need to mock/ignore for other React versions).

```js
mockModules({
	'react/lib/ReactContext.js', {},
	'react/lib/ExecutionEnvironment.js': {},
	'react/addons.js': {},
});
```
