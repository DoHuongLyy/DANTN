import express from 'express';
import multer from 'multer';
import { Builder } from "selenium-webdriver";
import fs from "fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import sharp from "sharp";
import cors from "cors";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = 3000;
const folder = path.join(__dirname, "PNGJS");

if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

app.use(cors());

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, folder),
  filename: (req, file, cb) => {
    const uniqueName = `design-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });
const multiUpload = upload.array("designImages", 10);

// Screenshot
async function captureScreenshot(driver, filename) {
  const image = await driver.takeScreenshot();
  const fullPath = path.join(folder, filename);
  fs.writeFileSync(fullPath, image, "base64");
  return fullPath;
}

// Diff ảnh
async function createDiff(img1Path, img2Path, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(img1Path));
  await sharp(img2Path)
    .resize(img1.width, img1.height)
    .toFormat("png")
    .toFile(path.join(folder, "resized-actual.png"));

  const img2 = PNG.sync.read(fs.readFileSync(path.join(folder, "resized-actual.png")));
  const { width, height } = img1;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    img1.data, img2.data, diff.data, width, height,
    {
      threshold: 0.05,
      diffColor: [255, 0, 0],
      aaColor: [255, 255, 0],
      includeAA: true,
      alpha: 0.5
    }
  );

  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return numDiffPixels;
}

// API /compare-many
app.post("/compare-many", multiUpload, async (req, res) => {
  const files = req.files;
  const websiteURLs = req.body.websiteURLs;

  const urlsArray = Array.isArray(websiteURLs) ? websiteURLs : [websiteURLs];
  if (!files || !urlsArray || files.length !== urlsArray.length) {
    return res.status(400).send("Số ảnh và URL không khớp hoặc thiếu.");
  }

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = urlsArray[i];
    const designPath = file.path;
    const actualPath = path.join(folder, `actual-${Date.now()}-${i}.png`);
    const diffPath = path.join(folder, `diff-${Date.now()}-${i}.png`);

    let driver;
    try {
      driver = await new Builder().forBrowser("chrome").build();
      await driver.get(url);
      await driver.sleep(2000);
      await captureScreenshot(driver, path.basename(actualPath));

      const numDiff = await createDiff(designPath, actualPath, diffPath);

      results.push({
        linkImg1: path.relative(__dirname, designPath).replace(/\\/g, "/"),
        linkImg2: path.relative(__dirname, actualPath).replace(/\\/g, "/"),
        linkImg3: path.relative(__dirname, diffPath).replace(/\\/g, "/"),
        khac: numDiff
      });

    } catch (err) {
      console.error(`Lỗi ở cặp ${i + 1}:`, err);
      results.push({ error: `Lỗi xử lý cặp ${i + 1}` });
    } finally {
      if (driver) await driver.quit();
    }
  }

  res.json(results);
});

// ========== TÍCH HỢP KIỂM THỬ TƯƠNG THÍCH GIAO DIỆN ===========
app.post("/lighthouse-audit", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Thiếu URL." });
  const chrome = await launch({ /* options */ });
  const options = {
    logLevel: "info",
    output: "html",
    onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
    port: chrome.port,
    formFactor: "desktop",
  };

  try {
    const runnerResult = await lighthouse(url, options);
    const reportHtml = runnerResult.report;
    const reportPath = path.join(__dirname, "public/uploads/lighthouse-report.html");
    fs.writeFileSync(reportPath, reportHtml);
    await chrome.kill();
    res.json({
      message: "Đã tạo báo cáo Lighthouse",
      report: "/uploads/lighthouse-report.html"
    });
  } catch (err) {
    await chrome.kill();
    console.error("Lỗi Lighthouse:", err);
    res.status(500).json({ error: "Không thể tạo báo cáo Lighthouse." });
  }
});


// Serve ảnh
app.use("/PNGJS", express.static(folder));

// Start server
app.listen(port, () => {
  console.log(` Server chạy tại http://localhost:${port}`);
});
