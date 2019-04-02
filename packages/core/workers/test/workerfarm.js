import Logger from '@parcel/logger';
import assert from 'assert';
import WorkerFarm from '../';

describe('WorkerFarm', () => {
  it('Should start up workers', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: false,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/ping.js')
      }
    );

    assert.equal(await workerfarm.run(), 'pong');

    await workerfarm.end();
  });

  it('Should handle 1000 requests without any issue', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: false,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/echo.js')
      }
    );

    let promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(workerfarm.run(i));
    }
    await Promise.all(promises);

    await workerfarm.end();
  });

  it('Should consistently initialise workers, even after 100 re-inits', async () => {
    let options = {
      key: 0
    };

    let workerfarm = new WorkerFarm(options, {
      warmWorkers: false,
      useLocalWorker: false,
      workerPath: require.resolve('./integration/workerfarm/init.js')
    });

    for (let i = 0; i < 100; i++) {
      options.key = i;
      workerfarm.init(options);

      for (let i = 0; i < workerfarm.workers.size; i++) {
        assert.equal((await workerfarm.run()).key, options.key);
      }
      assert.equal(workerfarm.shouldUseRemoteWorkers(), true);
    }

    await workerfarm.end();
  });

  it('Should warm up workers', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: true,
        useLocalWorker: true,
        workerPath: require.resolve('./integration/workerfarm/echo.js')
      }
    );

    for (let i = 0; i < 100; i++) {
      assert.equal(await workerfarm.run(i), i);
    }

    await new Promise(resolve => workerfarm.once('warmedup', resolve));

    assert(workerfarm.workers.size > 0, 'Should have spawned workers.');
    assert(
      workerfarm.warmWorkers >= workerfarm.workers.size,
      'Should have warmed up workers.'
    );

    await workerfarm.end();
  });

  it('Should use the local worker', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: true,
        useLocalWorker: true,
        workerPath: require.resolve('./integration/workerfarm/echo.js')
      }
    );

    assert.equal(await workerfarm.run('hello world'), 'hello world');
    assert.equal(workerfarm.shouldUseRemoteWorkers(), false);

    await workerfarm.end();
  });

  it('Should be able to use bi-directional communication', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: false,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/ipc.js')
      }
    );

    assert.equal(await workerfarm.run(1, 2), 3);

    await workerfarm.end();
  });

  it('Should be able to handle 1000 bi-directional calls', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: false,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/ipc.js')
      }
    );

    for (let i = 0; i < 1000; i++) {
      assert.equal(await workerfarm.run(1 + i, 2), 3 + i);
    }

    await workerfarm.end();
  });

  it('Bi-directional call should return masters pid', async () => {
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: false,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/ipc-pid.js')
      }
    );

    let result = await workerfarm.run();
    assert.equal(result.length, 2);
    assert.equal(result[1], process.pid);
    assert.notEqual(result[0], process.pid);

    await workerfarm.end();
  });

  it('Should handle 10 big concurrent requests without any issue', async () => {
    // This emulates the node.js ipc bug for win32
    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: false,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/echo.js')
      }
    );

    let bigData = [];
    for (let i = 0; i < 10000; i++) {
      bigData.push('This is some big data');
    }

    let promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(workerfarm.run(bigData));
    }
    await Promise.all(promises);

    await workerfarm.end();
  });

  it('Forwards stdio from the child process and levels event source', async () => {
    let events = [];
    let logDisposable = Logger.onLog(event => events.push(event));

    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: true,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/stdio.js')
      }
    );

    await workerfarm.run();

    // Sort lexicographically by message text since Node streams buffer the text
    // and order can't be guaranteed.
    let sortByMessageText = messages =>
      messages.slice().sort((e1, e2) => e1.message.localeCompare(e2.message));

    assert.deepEqual(
      sortByMessageText(events),
      sortByMessageText([
        {
          level: 'info',
          message: 'one',
          type: 'log'
        },
        {
          level: 'info',
          message: 'two',
          type: 'log'
        },
        {
          level: 'error',
          message: 'three',
          type: 'log'
        },
        {
          level: 'error',
          message: 'four',
          type: 'log'
        },
        {
          level: 'error',
          message: 'five',
          type: 'log'
        }
      ])
    );

    logDisposable.dispose();
    await workerfarm.end();
  });

  it('Forwards logger events to the main process', async () => {
    let events = [];
    let logDisposable = Logger.onLog(event => events.push(event));

    let workerfarm = new WorkerFarm(
      {},
      {
        warmWorkers: true,
        useLocalWorker: false,
        workerPath: require.resolve('./integration/workerfarm/logging.js')
      }
    );

    await workerfarm.run();

    // assert.equal(events.length, 2);
    assert.deepEqual(events, [
      {
        level: 'info',
        message: 'omg it works',
        type: 'log'
      },
      {
        level: 'error',
        message: 'errors objects dont work yet',
        type: 'log'
      }
    ]);

    logDisposable.dispose();
    await workerfarm.end();
  });
});
