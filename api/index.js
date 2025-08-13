// api/index.js
import serverless from 'serverless-http';
import app from '../server-app.js';

export const config = { maxDuration: 10, regions: ['sin1'] };
export default serverless(app);
