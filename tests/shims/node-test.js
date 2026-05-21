function createNodeTestShim(target = globalThis) {
  const testFn = target.test || target.it;

  if (typeof testFn !== 'function') {
    throw new Error('node:test shim requires a global test/it function');
  }

  const shim = (name, fn, timeout) => testFn(name, fn, timeout);

  for (const modifier of ['only', 'skip', 'todo']) {
    if (typeof testFn[modifier] === 'function') {
      shim[modifier] = (...args) => testFn[modifier](...args);
    }
  }

  return shim;
}

function createDescribeShim(target = globalThis) {
  const describeFn = target.describe;

  if (typeof describeFn === 'function') {
    return (...args) => describeFn(...args);
  }

  return (name, fn) => {
    if (typeof fn === 'function') {
      return fn();
    }
    return undefined;
  };
}

const defaultShim = createNodeTestShim(globalThis);
const describeShim = createDescribeShim(globalThis);

module.exports = defaultShim;
module.exports.default = defaultShim;
module.exports.test = defaultShim;
module.exports.it = defaultShim;
module.exports.describe = describeShim;
module.exports.createNodeTestShim = createNodeTestShim;
module.exports.createDescribeShim = createDescribeShim;
