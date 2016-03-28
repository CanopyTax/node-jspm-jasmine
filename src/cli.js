import * as jsApi from './node-jspm-jasmine.js';

jsApi.runTests({}, function(err) {
	console.error(err);
	process.exit(1);
});
