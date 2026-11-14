// Root entrypoint forwarding to backend/index.js for unified process execution
const { startServer } = require("./backend/index.js");

if (typeof startServer === "function") {
  startServer();
}
