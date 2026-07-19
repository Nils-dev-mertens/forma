import { getGeneratedImage } from "@repo/storage";
import {Router} from "express"
import { getImageByName } from "@repo/db";

const router:Router = Router(); 

/**
 * @openapi
 * /api/photos/{imagename}:
 *   get:
 *     summary: Get a generated image
 *     description: Retrieve a generated image by its filename. Requires authentication and checks image ownership.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: imagename
 *         required: true
 *         schema:
 *           type: string
 *           example: "abc123def456.png"
 *         description: The name of the image file to retrieve
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
 *       401:
 *         description: Unauthorized - missing or invalid API key
 *       403:
 *         description: Forbidden - you don't have access to this image
 *       404:
 *         description: Image not found
 *       500:
 *         description: Failed to retrieve image
 */
router.get("/:imagename", async (req, res) => {
    const imagename = typeof req.params.imagename == "string" ? req.params.imagename : typeof req.params.imagename == "undefined" ? "" : req.params.imagename[0];

    if(imagename == undefined)
        {
            return res.status(400).send("give a valid imagename");
        }
    
    try {
        const userId = res.locals.user?.id; 
        
        if (!userId) {
            res.status(401).send("Unauthorized");
            return;
        }
        
        // Check if user owns this image
        const imageRecord = await getImageByName(userId, imagename);
        if (!imageRecord) {
            res.status(403).send("Access denied");
            return;
        }

        const imageBuffer = await getGeneratedImage(imagename);
        if (!imageBuffer) {
            res.status(404).send("Image not found");
            return;
        }

        const ext = imagename.split(".").pop()?.toLowerCase();
        let contentType = "application/octet-stream";

        if (ext === "jpg" || ext === "jpeg") {
            contentType = "image/jpeg";
        } else if (ext === "png") {
            contentType = "image/png";
        } else if (ext === "gif") {
            contentType = "image/gif";
        }

        res.setHeader("Content-Type", contentType);
        res.send(imageBuffer);
    } catch (error) {
        res.status(500).send("Failed to retrieve image");
    }
});

export default router;