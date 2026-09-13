'use strict';

if (process.env.NODE_ENV === 'production') {
  throw new Error('LOCAL_DEVELOPMENT_SERVER_REFUSES_PRODUCTION_ENV');
}

process.env.NODE_ENV = 'development';
process.env.OMNI_SEED_LOCAL_DEMO_ACCOUNTS = '1';

const runtime = require('../server/server');
const port = process.env.PORT || 3001;

runtime.databaseReady.then(() => {
  runtime.app.listen(port, () => {
    console.log(`OmniSeller local development API running on port ${port}`);
  });
}).catch(error => {
  console.error('LOCAL_DEVELOPMENT_API_START_FAILED:', error);
  process.exitCode = 1;
});
