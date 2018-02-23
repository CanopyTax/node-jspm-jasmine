import * as jsApi from './node-jspm-jasmine.js';
import commander from 'commander';

export function run(args) {

	commander
	.option('--jasmine-config <path>')
	.option('--package-path <path>')
	.option('-w, --watch')
	.option('--watch-files <glob>', 'A repeatable value where each one is a glob that determines which files to watch', collect, [])
	.option('--coverage', 'add a coverage report')
	.option('--coverage-dir <dir>')
	.option('--coverage-reporter <reporter>')
	.option('--coverage-files <glob>', 'A repeatable value where each one is a glob that determines which files to match', collect, [])
	.option('--clean-coverage-dir')
	.parse(process.argv)

	const config = {
		jasmineConfig: commander.jasmineConfig,
		packagePath: commander.packagePath,
		watch: commander.watch,
		watchFiles: commander.watchFiles,
	};

	if (commander.coverage) {
		config.coverage = {};
		if (commander.coverageDir) {
			config.coverage.dir = commander.coverageDir;
		}
		if (commander.coverageReporter) {
			config.coverage.reporter = commander.coverageReporter;
		}
		if (commander.coverageFiles) {
			config.coverage.files = commander.coverageFiles;
		}
		config.coverage.cleanDir = commander.cleanCoverageDir;
	}

	jsApi.runTests(config);
}

function collect(val, list) {
	list.push(val);
	return list;
}
