function defineIfMissing(target, key, value) {
  if (target[key] === undefined) {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
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

module.exports = {
  installCryptoGlobals,
  installFetchGlobals,
  installStreamGlobals,
};
