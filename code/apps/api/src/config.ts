import dotenv from "dotenv";

dotenv.config();

export const port : number = process.env.PORT != undefined ? Number(process.env.PORT) : 3001;
export const origin =
    process.env.ORIGIN != undefined
        ? process.env.ORIGIN
        : `http://localhost:${port}`;

export const aiEncryptionKey : string | undefined = process.env.AI_ENCRYPTION_KEY;
export const aiDefaultModel : string = process.env.AI_DEFAULT_MODEL ?? "gpt-4o-mini";

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
    tags: [
        { name: 'Sets', description: 'Manage reusable sets of fields and templates' },
        { name: 'Entries', description: 'Create and update records inside a set' },
        { name: 'Templates', description: 'Upload and inspect HTML templates' },
        { name: 'Generation', description: 'Render images from templates' },
        { name: 'Generated Images', description: 'Retrieve rendered images' },
        { name: 'API Keys', description: 'Create and manage API keys' },
        { name: 'Users', description: 'User management' },
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