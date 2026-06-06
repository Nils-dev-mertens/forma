import express from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import { getData } from "@repo/db";
import { GenerateKey, CheckKey, generateRandomName } from "@repo/auth";
import { ensureDirs, getGeneratedImage } from "@repo/storage";
import { getProfilePhoto } from "@repo/storage";
import { generateAndStoreImageFromTemplate, generateAndStoreImageFromTemplateStrict, getTemplateFields, renderTemplateStrict, type TemplateGenerationInput } from "@repo/generation";
import { GENERATED_IMAGES_DIR } from "@repo/storage";
import { join } from "path";
import { readFileSync } from "fs";

const app = express();

const Logger: RequestHandler = (req, res, next) => {
  console.log("there was an action " + req.baseUrl);
  next();
};

app.use(Logger);
app.use(express.json());

const upload = multer({ dest: GENERATED_IMAGES_DIR });

app.get("/", async (req, res) => {
  try {
    const data = await getData();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch shared data",
    });
  }
});

app.get("/key/new", async (req, res) => {
  const data = await GenerateKey();
  res.json({ key: data });
});

app.get("/key/:key", async (req, res) => {
  const key = req.params.key;
  const result = await CheckKey(key);
  res.send(result);
});

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

