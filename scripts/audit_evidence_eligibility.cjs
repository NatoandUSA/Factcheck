#!/usr/bin/env node
'use strict';

const path = require('path');
const sqlite3 = require('sqlite3');
const { auditProjectEligibility } = require('../server/evidenceEligibilityAudit');

const databasePath = process.argv[2];
if (!databasePath || !path.isAbsolute(databasePath)) {
  console.error(JSON.stringify({ error: 'ABSOLUTE_DATABASE_PATH_REQUIRED' }));
  process.exit(1);
}

const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, error => {
  if (error) {
    console.error(JSON.stringify({ error: 'READ_ONLY_DATABASE_OPEN_FAILED', code: error.code || 'UNKNOWN' }));
    process.exit(1);
  }

  db.serialize(() => {
    db.all('SELECT id, marketplace, state FROM research_projects ORDER BY id', [], (projectError, projects) => {
      if (projectError) return finishWithError(projectError);
      db.all(
        `SELECT id, project_id, source, evidence_state, metadata
         FROM research_evidence
         WHERE evidence_state = 'ACCEPTED'
         ORDER BY id`,
        [],
        (evidenceError, evidenceRows) => {
          if (evidenceError) return finishWithError(evidenceError);
          const report = auditProjectEligibility(projects, evidenceRows);
          db.close(closeError => {
            if (closeError) {
              console.error(JSON.stringify({ error: 'READ_ONLY_DATABASE_CLOSE_FAILED', code: closeError.code || 'UNKNOWN' }));
              process.exit(1);
            }
            console.log(JSON.stringify(report));
            process.exit(report.affectedProjectCount > 0 ? 2 : 0);
          });
        }
      );
    });
  });

  function finishWithError(queryError) {
    db.close(() => {
      console.error(JSON.stringify({ error: 'READ_ONLY_AUDIT_QUERY_FAILED', code: queryError.code || 'UNKNOWN' }));
      process.exit(1);
    });
  }
});
