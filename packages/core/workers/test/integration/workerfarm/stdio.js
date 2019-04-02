const WorkerFarm = require('../../../').default;

function run() {
  if (WorkerFarm.isWorker()) {
    // Only test this behavior in workers. Logging in the main process will
    // always work.
    console.log('one');
    process.stdout.write('two\n');
    console.warn('three');
    console.error('four');
    process.stderr.write('five\n');
  }
}

function init() {}

exports.init = init;
exports.run = run;