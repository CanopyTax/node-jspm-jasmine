import * as jsApi from './node-jspm-jasmine.js';
import commander from 'commander';

export function run(args) {

    commander
        .option('-c, --jasmine-config <path>')
        .option('-c, --package-path <path>')
        .parse(process.argv)

    let config = {
        jasmineConfig: commander.jasmineConfig,
        packagePath: commander.packagePath
    }

    jsApi.runTests(config, function(err) {
        console.error(err);
        process.exit(1);
    });
}
