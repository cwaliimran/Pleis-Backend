const faker = require("faker");

function fakePayload(schema) {
  const payload = {};
  for (const key of Object.keys(schema.paths)) {
    if (["_id", "__v", "createdAt", "updatedAt"].includes(key)) continue;
    const field = schema.paths[key];
    switch (field.instance) {
      case "String":
        payload[key] = faker.lorem.words(2);
        break;
      case "Number":
        payload[key] = faker.datatype.number();
        break;
      case "Boolean":
        payload[key] = faker.datatype.boolean();
        break;
      case "Date":
        payload[key] = new Date();
        break;
      default:
        payload[key] = null;
    }
  }
  return payload;
}

module.exports = { fakePayload };
