function defineIfMissing(target, key, value) {
  if (target[key] === undefined) {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

// requestAnimationFrame / cancelAnimationFrame shim.
//
// Why this exists:
//   The pizarra drag hook (usePizarraSurfaceDrag) RAF-batches move events and
//   must be deterministically testable. JSDOM does not implement a real RAF
//   loop, so without this shim the hook's frameRef stays null forever and the
//   test suite cannot observe the contract.
//
//   Per openspec/changes/pizarra-ux-overhaul/specs/board-canvas/spec.md
//   (Req 4, "Jest setup registers requestAnimationFrame"), the shim MUST
//   default to real-browser-like behavior and SHOULD fall back to a
//   microtask-scheduling shim when JSDOM is detected. We use a setTimeout(0)
//   fallback by default — close enough to the browser's vsync cadence for
//   RAF-batched tests, and trivially overridable via jest.useFakeTimers() in
//   suites that need deterministic timer control.
let __rafIdCounter = 0;
const __rafHandles = new Map();

function __rafFallback(callback) {
  const handle = ++__rafIdCounter;
  __rafHandles.set(
    handle,
    setTimeout(() => {
      __rafHandles.delete(handle);
      callback(performance.now());
    }, 0)
  );
  return handle;
}

function __cancelRafFallback(handle) {
  const timer = __rafHandles.get(handle);
  if (timer !== undefined) {
    clearTimeout(timer);
    __rafHandles.delete(handle);
  }
}

function installRafGlobals(target = globalThis) {
  // Real browsers and happy-dom ship their own RAF. Don't override those.
  if (typeof target.requestAnimationFrame === 'function' && !target.__PIZARRA_RAF_SHIM__) {
    defineIfMissing(target, '__PIZARRA_RAF_SHIM__', true);
    return;
  }

  defineIfMissing(target, 'requestAnimationFrame', __rafFallback);
  defineIfMissing(target, 'cancelAnimationFrame', __cancelRafFallback);
  Object.defineProperty(target, '__PIZARRA_RAF_SHIM__', {
    configurable: true,
    writable: true,
    value: true,
  });
}

function installStreamGlobals(target = globalThis) {
  const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web');

  defineIfMissing(target, 'ReadableStream', ReadableStream);
  defineIfMissing(target, 'WritableStream', WritableStream);
  defineIfMissing(target, 'TransformStream', TransformStream);
}

function installFetchGlobals(target = globalThis) {
  installStreamGlobals(target);

  const {
    fetch,
    Headers,
    Request,
    Response,
    FormData,
    File,
    Blob,
  } = require('next/dist/compiled/@edge-runtime/primitives/fetch');

  defineIfMissing(target, 'fetch', fetch);
  defineIfMissing(target, 'Headers', Headers);
  defineIfMissing(target, 'Request', Request);
  defineIfMissing(target, 'Response', Response);
  defineIfMissing(target, 'FormData', FormData);
  defineIfMissing(target, 'File', File);
  defineIfMissing(target, 'Blob', Blob);
}

function installCryptoGlobals(target = globalThis) {
  const { webcrypto, randomUUID } = require('node:crypto');

  if (!target.crypto && webcrypto) {
    defineIfMissing(target, 'crypto', webcrypto);
  }

  if (target.crypto && typeof target.crypto.randomUUID !== 'function') {
    Object.defineProperty(target.crypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: randomUUID,
    });
  }
}

installFetchGlobals(globalThis);
installCryptoGlobals(globalThis);
installRafGlobals(globalThis);

module.exports = {
  installCryptoGlobals,
  installFetchGlobals,
  installRafGlobals,
  installStreamGlobals,
  __cancelRafFallback,
  __rafFallback,
};
