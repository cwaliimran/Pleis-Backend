const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Your API',
    description: 'Auto-generated Swagger documentation',
    version: '1.0.0',
  },
  host: 'localhost:4012', // change to your server domain in production
  basePath: '/api/v1',
  schemes: ['http'],
  consumes: ['application/json'],
  produces: ['application/json'],
  tags: [
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'Organizations', description: 'Organization endpoints' },
    { name: 'Events', description: 'Event endpoints' },
  ],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      name: 'Authorization',
      in: 'header',
      description: 'Enter your JWT token (e.g. Bearer eyJhbGci...)',
    },
  },
};

const outputFile = './swagger/swagger_output.json';

// Include your main routes files here — swagger-autogen scans these automatically
const endpointsFiles = [
  './backend/routes/index.js',
];

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  // Optionally start the server after generation
  require('./backend/server.js'); // adjust path to your app entry file
});
