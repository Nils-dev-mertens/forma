import { CheckKey } from "@repo/auth";
import { logger } from "@repo/logger";
import {Router, type RequestHandler} from "express"
import templateroute from "./template"
import imageGenerationRoute from "./generation/image"
import keyRoute from "./key"
import photoRoute from "./photos"
import userRoute from "./users"
import setRoute from "./set"
import aiRoute from "./ai"
import authRoute from "./auth"

const router:Router = Router();

export const AuthHandler: RequestHandler = async (req, res, next) => {
    const rawKey = req.headers["x-api-key"] || req.headers.authorization;

    // Session-based auth takes priority for the dashboard.
    const sessionUserId = (req.session as any)?.userId;
    if (sessionUserId) {
        res.locals.user = {
            id: sessionUserId,
            keyId: null,
            keyPrefix: null,
            authenticated: true,
            authenticationMethod: "session"
        };
        return next();
    }

    // In development, allow unauthenticated requests but still validate keys
    // when they are provided. This lets Swagger with an API key work while
    // keeping the convenience of keyless local testing.
    if (!rawKey) {
        if (process.env.NODE_ENV === "development") {
            res.locals.user = {
                id: 1,
                keyId: null,
                keyPrefix: null,
                authenticated: false,
                authenticationMethod: "development_default"
            };
            logger.warn({
                message: "DEVELOPMENT MODE: API route accessed without authentication",
                path: req.path,
                method: req.method,
                ip: req.ip
            });
            return next();
        }

        logger.warn({
            message: "API request without authentication header",
            path: req.path,
            method: req.method
        });
        return res
            .status(401)
            .json({ 
                error: "Geen API-sleutel gevonden in de headers.",
                details: "Verstuur een 'x-api-key' header met je API sleutel."
            });
    }

    const keyInput = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (typeof keyInput !== "string" || keyInput.trim() === "") {
        logger.warn({
            message: "Invalid API key format received",
            keyType: typeof keyInput,
            keyValue: rawKey
        });
        return res
            .status(401)
            .json({ 
                error: "Ongeldige API-sleutel (geen string of leeg).",
                details: "De API sleutel moet een niet-lege string zijn."
            });
    }

    // Support "Authorization: Bearer <key>" as well as "x-api-key: <key>".
    const keyString = keyInput.replace(/^Bearer\\s+/i, "");

    try {
        const isValid = await CheckKey(keyString);
        if (!isValid) {
            logger.warn({
                message: "Invalid API key attempt",
                keyPrefix: keyString.substring(0, 10) + "...",
                path: req.path,
                method: req.method
            });
            return res.status(403).json({ 
                error: "Ongeldige API-sleutel.",
                details: "De opgegeven API sleutel is niet geldig of is verlopen."
            });
        }

        // Key is valid, get user information from database
        const { getApiKeyByKey } = await import("@repo/db");
        const keyData = await getApiKeyByKey(keyString);

        if (keyData) {
            // Store user information in res.locals for downstream middleware/routes
            res.locals.user = {
                id: keyData.userId,
                keyId: keyData.id,
                keyPrefix: keyString.substring(0, 10) + "...",
                authenticated: true,
                authenticationMethod: "api_key"
            };

            // Log successful authentication with user context
            logger.info({
                message: "Successful API authentication",
                userId: keyData.userId,
                keyId: keyData.id,
                keyPrefix: keyString.substring(0, 10) + "...",
                path: req.path,
                method: req.method
            });
        } else {
            logger.warn({
                message: "Key validated but no user data found",
                keyPrefix: keyString.substring(0, 10) + "...",
                path: req.path,
                method: req.method
            });
            return res.status(500).json({
                error: "Interne serverfout.",
                details: "API sleutel is geverifieerd maar gebruikersgegevens ontbreken."
            });
        }

    } catch (error) {
        logger.error({
            message: "Error while checking API key validity",
            error: error,
            path: req.path,
            method: req.method
        });
        return res.status(500).json({ 
            error: "Interne serverfout.",
            details: "Er is een fout opgetreden bij het valideren van de API sleutel."
        });
    }

    next();
};

if (process.env.NODE_ENV != "development") {
    logger.info({ message: "Api route is using key protection" });
}

router.use(AuthHandler);

router.use("/template", templateroute)
router.use("/generation/image", imageGenerationRoute)
router.use("/key", keyRoute)
router.use("/photos", photoRoute)
router.use("/users", userRoute)
router.use("/set", setRoute)
router.use("/ai", aiRoute)
router.use("/auth", authRoute)

export default router;