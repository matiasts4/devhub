'use strict';

const path = require('path');
const DB_PATH = path.resolve(__dirname, 'db.js');

describe('lib/db.js barrel', () => {
  it('re-exports all 5 functions from compactReads.js', () => {
    const db = require(DB_PATH);
    expect(typeof db.readExecutionQueueSummary).toBe('function');
    expect(typeof db.readWorkspaceEvidenceSummary).toBe('function');
    expect(typeof db.presentExecutionQueue).toBe('function');
    expect(typeof db.presentWorkspaceEvidence).toBe('function');
    expect(typeof db.createDirectorQueueContract).toBe('function');
  });

  it('re-exports getDb from core.js', () => {
    const db = require(DB_PATH);
    expect(typeof db.getDb).toBe('function');
  });

  it('re-exports closeDb from core.js', () => {
    const db = require(DB_PATH);
    expect(typeof db.closeDb).toBe('function');
  });

  it('exports claimNextTask function', () => {
    const db = require(DB_PATH);
    expect(typeof db.claimNextTask).toBe('function');
  });

  it('exports releaseTask function', () => {
    const db = require(DB_PATH);
    expect(typeof db.releaseTask).toBe('function');
  });
});
