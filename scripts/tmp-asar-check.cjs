const asar = require('D:/devhub/node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
const A = 'D:/devhub/dist/electron/win-unpacked/resources/app.asar';
const pkg = asar.extractFile(A, 'package.json').toString();
const head = pkg.trimStart().slice(0, 120);
console.log('package.json starts clean:', head.startsWith('{'));
console.log(head);
const main = asar.extractFile(A, 'desktop/electron/main.js').toString();
console.log('main.js starts clean:', main.startsWith("'use strict'"));
