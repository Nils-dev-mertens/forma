import express from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import { getData } from "@repo/db";
import { GenerateKey, CheckKey, generateRandomName } from "@repo/auth";
import { ensureDirs, getGeneratedImage } from "@repo/storage";
import { generateAndStoreImageFromTemplate, generateAndStoreImageFromTemplateStrict, getTemplateFields, renderTemplateStrict, type TemplateGenerationInput } from "@repo/generation";
import { GENERATED_IMAGES_DIR } from "@repo/storage";
import { join } from "path";
import { readFileSync } from "fs";
import { logger } from "@repo/logger";
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import dotenv from 'dotenv';

dotenv.config();

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'My API',
    version: '1.0.0',
    description: 'API documentation for development',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ['./index.ts'], // Path to the API docs (could add explicit route files if modularized)
};

const swaggerSpec = swaggerJSDoc(options);

const app = express();

if (process.env.NODE_ENV === 'development') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

export const AuthHandler: RequestHandler = async (req, res, next) => {
  const key = req.headers['x-api-key'] || req.headers.authorization;

  if (!key) {
    return res.status(401).json({ error: "Geen API-sleutel gevonden in de headers." });
  }

  const keyString = Array.isArray(key) ? key[0] : key;

  if (typeof keyString !== 'string' || keyString.trim() === '') {
    return res.status(401).json({ error: "Ongeldige API-sleutel (geen string of leeg)." });
  }

  try {
    const isValid = await CheckKey(keyString);
    if (!isValid) {
      return res.status(403).json({ error: "Ongeldige API-sleutel." });
    }
  } catch (error) {
    logger.error({ message : "Catch an error while checking if the apikey is valid or not" ,error : error});
    return res.status(500).json({ error: "Interne serverfout." });
  }

  next();
};

app.use(express.json());

const upload = multer({ dest: GENERATED_IMAGES_DIR });

/**
 * @openapi
 * /key/new:
 *   get:
 *     description: Generate a new API key
 *     responses:
 *       200:
 *         description: The new API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 */
app.get("/key/new", async (req, res) => {
  const data = await GenerateKey();
  res.json({ key: data });
});

if (process.env.NODE_ENV != 'development') {
  app.use(AuthHandler);
}

/**
 * @openapi
 * /photos/{imagename}:
 *   get:
 *     description: Retrieve an image by name
 *     parameters:
 *       - in: path
 *         name: imagename
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the image file
 *     responses:
 *       200:
 *         description: The image file
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/gif:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image not found
 */
app.get('/photos/:imagename', async (req, res) => {
  const imagename = req.params.imagename;

  try {
    const imageBuffer = await getGeneratedImage(imagename);
    if (!imageBuffer) {
      res.status(404).send('Image not found');
      return;
    }

    const ext = imagename.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';

    if (ext === 'jpg' || ext === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === 'png') {
      contentType = 'image/png';
    } else if (ext === 'gif') {
      contentType = 'image/gif';
    }

    res.setHeader('Content-Type', contentType);
    res.send(imageBuffer);
  } catch (error) {
    res.status(500).send('Failed to retrieve image');
  }
});

/**
 * @openapi
 * /generate-image:
 *   post:
 *     description: Generate an image from template input
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 description: Template generation input
 *                 type: object
 *     responses:
 *       200:
 *         description: Generated image name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imagename:
 *                   type: string
 *       400:
 *         description: Missing input or imagename
 *       500:
 *         description: Failed to generate image
 */
app.post('/generate-image', async (req, res) => {
  try {
    const input: TemplateGenerationInput = req.body.input;
    console.log(input);
    const imagename: string = generateRandomName({length : 12, endsWith : ".png"});
    if (!input || !imagename) {
      res.status(400).send('Missing input or imagename');
      return;
    }

    await generateAndStoreImageFromTemplate(input, imagename);
    res.json({ imagename });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate image"});
  }
});

/**
 * @openapi
 * /generate-image-strict:
 *   post:
 *     description: Generate an image from template input (strict mode)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 description: Template generation input
 *                 type: object
 *     responses:
 *       200:
 *         description: Generated image name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imagename:
 *                   type: string
 *       400:
 *         description: Missing input or imagename
 *       500:
 *         description: Failed to generate image
 */
app.post('/generate-image-strict', async (req, res) => {
  try {
    const input: TemplateGenerationInput = req.body.input;
    console.log(input);
    const imagename: string = generateRandomName({length : 12, endsWith : ".png"});
    if (!input || !imagename) {
      res.status(400).send('Missing input or imagename');
      return;
    }

    await generateAndStoreImageFromTemplateStrict(input, imagename);
    res.json({ imagename });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate image"});
  }
});

/**
 * @openapi
 * /upload-template:
 *   post:
 *     description: Upload a template file
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 format: binary
 *                 description: Template file to upload
 *     responses:
 *       200:
 *         description: Template upload result with fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 filename:
 *                   type: string
 *                 fields:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: No file uploaded
 *       500:
 *         description: Failed to upload template
 */
app.post('/upload-template', upload.single('template'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).send('No file uploaded');
      return;
    }

    const templateStorageDir = join(__dirname, '../../local-blob-storage/templates');
    const fs = require('fs').promises;

    const newTemplateName:string = generateRandomName({length : 12, endsWith : ".html"})

    const oldPath = req.file.path;
    const newPath = join(templateStorageDir, newTemplateName);

    await fs.rename(oldPath, newPath);

    const htmlContent = readFileSync(newPath, "utf8");
    const fields = getTemplateFields(htmlContent);

    res.json({ message: 'Template uploaded', filename: newTemplateName, fields });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to upload template"});
  }
});

app.listen(3001, async () => {
  await ensureDirs();
  console.log('Server is running on http://localhost:3001');
});

