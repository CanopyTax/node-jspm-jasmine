import chalk from 'chalk';

export default {
	start() {
		console.log(chalk.cyan(`*********************** Starting node-jspm-jasmine tests ***********************`) + '\n');
		const startTime = Date.now();
		return {
			finish() {
				const endTime = Date.now();
				const testTime = endTime - startTime;

				console.log('\n' + chalk.cyan(`************ node-jspm-jasmine tests completed in ${testTime} milliseconds ************`));
			}
		}
	}
}
