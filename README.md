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
Custom path to jasmine.json config file:

`jspmjasmine --jasmine-config
"PATH/TO/JASMINE/JSON/RELATIVE/TO/CWD/config.json"`
* Note: `jasmine-config` defaults to path where `jspmjasmine` is being executed + `/spec/support/jasmine.json`.

Custom path to package.json config file:

`jspmjasmine --package-path "PATH/TO/PACKAGE/JSON/RELATIVE/TO/CWD/"`
* Note: `package-path` defaults to path where `jspmjasmine` is being executed.

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
    // Provide a custom path to jasmine.json config file.
    // Defaults to path where the script is being
    // executed + '/spec/support/jasmine.json'.
    jasmineConfig: "PATH/TO/JASMINE/JSON/RELATIVE/TO/CWD/",

    // Provide a custom path to package.json config file.
    // Defaults to path where the script is being executed.
    packagePath: "PATH/TO/PACKAGE/JSON/RELATIVE/TO/CWD/"
})
```

Alternatively, you can pass the jasmine config object directly.
```js
runTests({
    // Provide a custom jasmine configuration without a jasmine.json.
    jasmineConfig: {
        "spec_dir": "src/test/specs",
        "spec_files": ["**/*.js"],
        "helpers": []
    },
    packagePath: "PATH/TO/PACKAGE/JSON/RELATIVE/TO/CWD/"
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
