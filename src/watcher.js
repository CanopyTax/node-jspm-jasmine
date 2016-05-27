/* Everything about the watcher is a singleton -- only one
 * exists ever.
*/
import { throttle } from 'lodash';
import chokidar from 'chokidar';

import { runTests } from './node-jspm-jasmine.js';

const filesWatching = new Set();
const debouncedRerunTests = throttle(rerunTests, 200);
let watcher;

let actuallyWatching, opts, errCallback, numRunsWaitingOn = 0;

let rerunAsap = false;

export function isWatching() {
	return actuallyWatching;
}

export function initWatcher(_actuallyWatching, _opts, _errCallback) {
	actuallyWatching = _actuallyWatching;
	opts = _opts;
	errCallback = _errCallback;

	if (!watcher) {
		watcher = chokidar.watch(opts.watchFiles);
		watcher.on('change', debouncedRerunTests);
		watcher.on('error', err => {
			console.error(`Watcher failed with error ${err}`);
		})
	}

	numRunsWaitingOn++;
}

export function finishedTestRun() {
	numRunsWaitingOn--;
	if (rerunAsap)
		debouncedRerunTests();
}

export function watchFile(file) {
	if (!actuallyWatching)
		return;

	if (typeof file !== 'string') {
		throw new Error(`Watcher 'handleFile' function called without a real filepath as a parameter`);
	}

	// Many times the packagePath ends up being just '.'
	if (file === '.')
		return;

	if (!filesWatching.has(file)) {
		watcher.add(file);
		filesWatching.add(file);
	}
}

function rerunTests(filename) {
	if (actuallyWatching) {
		if (numRunsWaitingOn === 0) {
			rerunAsap = false;
			runTests(opts, errCallback);
		} else {
			rerunAsap = true;
		}
	}
}
