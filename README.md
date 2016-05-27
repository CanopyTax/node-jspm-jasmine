# node-jspm-jasmine
Run jasmine tests on a jspm project, without karma. Keep your existing `jasmine.json`, `config.js`, and `jspm_packages`. The hope is that everything will just "work out of the box".

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
node-jspm-jasmine exposes a cli that is accessible through the `jspmjasmine` command. All [jasmine configuration options](http://jasmine.github.io/2.4/node.html#section-Configuration) will be respected, with all `helpers` and `spec_files` being loaded via JSPM instead of node's `require` function.

* Note: node-jspm-jasmine will expose the `System` object to the `global`, for convenience.

##### Options:
Provide a custom jasmine.json config file:<br />
`jspmjasmine --jasmine-config "RELATIVE/PATH/TO/jasmine.json"`<br />
<sub>*Defaults to path where `jspmjasmine` is being executed + `/spec/support/jasmine.json`*</sub>

Provide a custom directory to package.json:<br />
`jspmjasmine --package-path "RELATIVE/PATH/TO/PACKAGE/JSON/DIRECTORY/"`<br />
<sub>*Defaults to path where `jspmjasmine` is being executed.*</sub>

Set up a test watcher to automatically re-run tests when files change:<br />
`jspmjasmine --watch`<br />
`jspmjasmine -w`<br />
<sub>*If omitted, defaults to just a single test run.<br />
     *When present, it defaults to watching coverage files, helpers, jasmine.json, and spec files.</sub>

Configure test watcher to re-run tests when specific files change:<br />
`jspmjasmine --watch-files <glob-pattern>`<br />
<sub>*You can provide more than one glob pattern by adding ``--watch-files <pattern>`` more than once<br />
     *Note that if you use --watch-files that it is not necessary to also use --watch</sub>

Add a coverage report:<br />
`jspmjasmine --coverage`<br />
<sub>*Defaults to undefined (no coverage).*</sub>

Provide a custom directory for storing coverage reports:<br />
`jspmjasmine --coverage-dir "RELATIVE/PATH/TO/COVERAGE/DIRECTORY/"`<br />
<sub>*Defaults to "./coverage/".*</sub>

Provide a custom type for coverage reports:<br />
`jspmjasmine --coverage-reporter "TYPE"`<br />
<sub>*Defaults to "html" (all report types shipped with Istanbul are supported).*</sub>

Provide files to be instrumented by Istanbul coverage:<br />
`jspmjasmine --coverage-files "RELATIVE/GLOB/PATH/TO/FILES/**/*.js"`<br />
*Important:* Be sure to put globs in quotes to prevent the OS from expanding them before node-jspm-jasmine gets them. <br />
<sub>*Defaults empty array (no files).*</sub>

Allow `node-jspm-jasmine` to empty coverage directory before creating a new report:<br />
`jspmjasmine --clean-coverage-dir`<br />
<sub>*Defaults to undefined (no clean up).*</sub>

## JS API
node-jspm-jasmine exports named exports which are to be used as a js library. Example:
```js
import * as nodeJspmJasmine from 'node-jspm-jasmine';
nodeJspmJasmine.runTests({});
```

#### runTests(opts)
This will run your jasmine tests, loading all the tests with JSPM instead of node's `require`.

##### Options:
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

## Ignoring / mocking specific imports
What you're about to read is nothing specific to node-jspm-jasmine, but I figured writing it down might save someone from sifting through hard-to-find docs for Jasmine and JSPM/SystemJS/es6-module-loader. In order to mock or ignore files, you should create a [jasmine helper file](http://jasmine.github.io/2.4/node.html#section-12) so that the mocking/ignoring is done before the tests are run. These files by default go into your `spec/helpers` directory, but that can be controlled in the jasmine.json file (note that the file patterns that you put into the `helpers` array will be relative to the `spec` directory itself, not the package's root directory nor the `spec/helpers` directory). Once you've got a helper file, use [System.registerDynamic](https://github.com/systemjs/systemjs/blob/master/docs/system-api.md#systemregisterdynamicname--deps-executingrequire-declare) to do one of the following:

**Ignoring a dependency**
```js
System.registerDynamic('name-of-ignored-dependency-just-like-it-is-imported', [], false, function() {});
```

**Mocking a dependency**
```js
System.registerDynamic('name-of-mocked-dependency-just-like-it-is-imported', ['name-of-dependency-of-mocked-module'], false, function(require, exports, module) {
  module.exports = {
    foo: 'bar',
  };
});
```

## Usage with Enzyme
Although [Enzyme](http://airbnb.io/enzyme/) is not related to jspm or jasmine, the reason this project was started was to figure out an easy way to get a JSPM + React project to run tests with Jasmine and Enzyme. So here's how:

- Create a jasmine helper file, as explained [above](https://github.com/CanopyTax/node-jspm-jasmine#ignoring--mocking-specific-imports)
- In the jasmine helper file, put the following (this works for react 15.0, see [enzyme's docs for webpack](https://github.com/airbnb/enzyme/blob/master/docs/guides/webpack.md) to find which specific things you need to mock/ignore for other React versions).

```js
System.registerDynamic("react/lib/ReactContext.js", [], false, function() {})
System.registerDynamic("react/lib/ExecutionEnvironment.js", [], false, function() {})
```
