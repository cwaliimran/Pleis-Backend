const request = require("supertest");
const chalk = require("chalk");

async function testEndpoint(app, endpoint, payload = null) {
  const { method, fullPath } = endpoint;

  switch (method) {
    case "GET":
      return request(app).get(fullPath).expect(200);
    case "POST":
      return request(app).post(fullPath).send(payload || {}).expect(201);
    case "PUT":
      return request(app).put(fullPath).send(payload || {}).expect(200);
    case "DELETE":
      return request(app).delete(fullPath).expect(200);
    default:
      console.warn(chalk.yellow(`Unsupported method: ${method}`));
  }
}

module.exports = { testEndpoint };
