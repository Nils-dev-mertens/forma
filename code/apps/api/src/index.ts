import { origin, port, nodeEnv } from "./config"
import express from "express";
import cookieSession from "cookie-session";
import { ensureDirs, SET_IMAGES_DIR, PROFILE_LOGOS_DIR } from "@repo/storage";
import { join } from "path";
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

if (nodeEnv === "development") {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use(express.json());

app.set("trust proxy", 1);
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET ?? "development-secret-change-in-production"],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: nodeEnv === "production",
    sameSite: nodeEnv === "production" ? "none" : "lax",
    httpOnly: true,
  })
);

app.use("/api", apiRoute)

app.use("/tempphotos", express.static(tempDir));
app.use("/set-images", express.static(SET_IMAGES_DIR));
app.use("/profile-logos", express.static(PROFILE_LOGOS_DIR));

app.listen(port, async () => {
    await ensureDirs();
    console.log(`Server is running on ${origin}`);
});