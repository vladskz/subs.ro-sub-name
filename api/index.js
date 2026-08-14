// Vercel serverless function entrypoint.
// The Express app lives in the project root and is exported from server.js.
const app = require("../server");

module.exports = (req, res) => app(req, res);
