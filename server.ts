import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import Replicate from "replicate";
import cors from "cors";
import fs from "fs";

// Initialize Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Multer for file uploads (storing in memory for simplicity in this environment)
  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  app.post("/api/try-on", upload.fields([
    { name: 'personImage', maxCount: 1 },
    { name: 'garmentImage', maxCount: 1 }
  ]), async (req: any, res) => {
    try {
      console.log("REPLICATE_API_TOKEN is set:", !!process.env.REPLICATE_API_TOKEN);
      if (!process.env.REPLICATE_API_TOKEN) {
        return res.status(500).json({ error: "REPLICATE_API_TOKEN is not configured. Please add it to the Secrets panel." });
      }

      const files = req.files as { [fieldname: string]: any[] };
      
      if (!files.personImage || !files.garmentImage) {
        return res.status(400).json({ error: "Missing images" });
      }

      const personImageBase64 = `data:${files.personImage[0].mimetype};base64,${files.personImage[0].buffer.toString('base64')}`;
      const garmentImageBase64 = `data:${files.garmentImage[0].mimetype};base64,${files.garmentImage[0].buffer.toString('base64')}`;

      console.log("Starting Replicate prediction...");
      
      // List of potential IDM-VTON models to try in case of permission/version issues
      const models = [
        "yisol/idm-vton:c8718e4b1303279511f00e4d7d6a2d2821f9974156a7ad541d68393e0ac4106b",
        "cuuupid/idm-vton:90649c8333616677a7b0685070f31237a1188928511d3a5a01384c9270b13443",
        "vikot99/idm-vton:39523171170798e27f415951a54776100c50810766a5e12e9603099951680a6b"
      ];

      let output = null;
      let lastError = null;

      for (const model of models) {
        try {
          console.log(`Trying model: ${model}`);
          output = await replicate.run(
            model as any,
            {
              input: {
                crop: false,
                seed: 42,
                steps: 30,
                category: "upper_body",
                force_dc: false,
                human_img: personImageBase64,
                garm_img: garmentImageBase64,
                garment_des: "a garment",
                guidance_scale: 2.5
              }
            }
          );
          if (output) break;
        } catch (error: any) {
          console.error(`Error with model ${model}:`, error.message);
          lastError = error;
        }
      }

      if (!output) {
        throw lastError || new Error("All models failed to process.");
      }

      res.json({ result: output });
    } catch (error: any) {
      console.error("Replicate Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
