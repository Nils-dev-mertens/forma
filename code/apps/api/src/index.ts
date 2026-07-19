import { origin, port } from "./config"
import express from "express";
import {
    ensureDirs
} from "@repo/storage";
import path from "path";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import { config } from "./config.ts";
import { initializeDatabase } from "@repo/db";
import apiRoute from "./routes/api/"
import photoRoute from "./routes/api/photos.ts"

const swaggerSpec = swaggerJSDoc(config);

const app = express();

const tempDir = path.resolve(process.cwd(), "../../local-blob-storage/temp");

// Initialize database when the server starts
initializeDatabase().catch(error => {
  console.error("Failed to initialize database:", error);
});

if (process.env.NODE_ENV === "development") {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use(express.json());

app.use("/api", apiRoute)

app.use("/tempphotos", express.static(tempDir));

app.listen(port, async () => {
    await ensureDirs();
    console.log(`Server is running on ${origin}`);
});