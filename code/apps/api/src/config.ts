import dotenv from "dotenv";

dotenv.config();

export const port : number = process.env.PORT != undefined ? Number(process.env.PORT) : 3001;
export const origin =
    process.env.ORIGIN != undefined
        ? process.env.ORIGIN
        : `http://localhost:${port}`;

const swaggerDefinition = {
  openapi: '3.0.0',
    info: {
    title: 'Forma API',
    version: '1.0.0',
    description: 'Forma API - Image generation and template management service',
    contact: {
      name: 'Forma API Support',
      email: 'support@forma.example.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
    },
    servers: [
        {
      url: 'http://localhost:3001',
      description: 'Development server',
        },
        {
      url: 'https://api.forma.example.com',
      description: 'Production server',
        }
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'x-api-key',
          in: 'header',
          description: 'API key for authentication. Include this header in all requests.'
        }
      }
    },
    security: [
      {
        apiKey: []
      }
    ]
};

export const config = {
    swaggerDefinition,
    apis: ["./src/**/*.ts"], // Path to the API docs (could add explicit route files if modularized)
};