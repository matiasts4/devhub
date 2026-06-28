/* eslint-disable */
const fs = require('fs');
const path = require('path');

function getDirSize(dirPath) {
  let totalSize = 0;
  let fileCount = 0;
  const sizes = {};

  function walk(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          totalSize += stat.size;
          fileCount++;
          const topDir = fullPath.split(path.sep)[2] || 'root'; // .next/standalone/XXX
          if (!sizes[topDir]) sizes[topDir] = 0;
          sizes[topDir] += stat.size;
        }
      }
    } catch (e) {}
  }

  if (fs.existsSync(dirPath)) {
    walk(dirPath);
  }

  const result = Object.entries(sizes)
    .map(([dir, bytes]) => ({ dir, mb: (bytes / 1024 / 1024).toFixed(1), bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    totalMB: (totalSize / 1024 / 1024).toFixed(1),
    fileCount,
    topDirs: result.slice(0, 15),
  };
}

const stand = '.next/standalone';
const report = getDirSize(stand);
console.log('STANDALONE DIR REPORT');
console.log('Total:', report.totalMB, 'MB');
console.log('Files:', report.fileCount);
console.log('Top dirs by size:');
report.topDirs.forEach((d) => console.log(' ', d.dir + ':', d.mb, 'MB'));
