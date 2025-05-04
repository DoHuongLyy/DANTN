import { Builder } from "selenium-webdriver";
import fs from "fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import sharp from "sharp";
import Tesseract from "tesseract.js";

const folder = "PNGJS/";

async function captureScreenshot(driver, filename) {
  let image = await driver.takeScreenshot();
  fs.writeFileSync(filename, image, "base64");
}

async function compareImages(img1Path, img2Path, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(img1Path)); // ảnh thiết kế

  // Resize ảnh thực tế cho khớp kích thước với thiết kế
  await sharp(img2Path)
    .resize(img1.width, img1.height)
    .toFile("resized-actual.png");

  const img2 = PNG.sync.read(fs.readFileSync("resized-actual.png"));

  const { width, height } = img1;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    {
      threshold: 0.2,
      diffColor: [255, 0, 0], // dùng màu hợp lệ (0-255)
      aaColor: [105, 105, 0],
      includeAA: true,
      alpha: 0.5,
    }
  );

  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  console.log(` Số pixel khác biệt về màu sắc: ${numDiffPixels}`);
}

async function extractTextFromImage(imagePath) {
  const result = await Tesseract.recognize(imagePath, "eng", {
    logger: (m) =>
      console.log(`OCR: ${m.status} - ${Math.floor((m.progress || 0) * 100)}%`),
  });
  return result.data.text.replace(/\s+/g, " ").trim();
}

async function compareTextBetweenImages(baselineImg, actualImg) {
  console.log(" Đang nhận diện chữ từ ảnh thiết kế...");
  const baselineText = await extractTextFromImage(baselineImg);
  console.log(" Văn bản từ ảnh thiết kế:", baselineText);

  console.log(" Đang nhận diện chữ từ ảnh thực tế...");
  const actualText = await extractTextFromImage(actualImg);
  console.log(" Văn bản từ ảnh thực tế:", actualText);

  const baselineWords = baselineText.split(" ").filter(Boolean);
  const actualWords = actualText.split(" ").filter(Boolean);

  const missingWords = baselineWords.filter(
    (word) => !actualWords.includes(word)
  );
  const extraWords = actualWords.filter(
    (word) => !baselineWords.includes(word)
  );

  if (missingWords.length > 0) {
    console.log(" Các từ bị thiếu trong ảnh thực tế:");
    console.log("   " + missingWords.join(", "));
  } else {
    console.log("Không có từ nào bị thiếu trong ảnh thực tế.");
  }

  if (extraWords.length > 0) {
    console.log(
      " Các từ xuất hiện thêm trong ảnh thực tế (không có trong thiết kế):"
    );
    console.log("   " + extraWords.join(", "));
  } else {
    console.log("Không có từ nào xuất hiện thêm ngoài thiết kế.");
  }
}

async function test() {
  let driver = await new Builder().forBrowser("chrome").build();

  try {
    await driver.get("http://127.0.0.1:5500/HTML/giohang.html");
    await driver.sleep(2000);

    const actualPath = folder + "Giỏ hànga.png";
    const baselinePath = folder + "Giỏ hàng (1).png";
    const diffPath = folder + "Giỏ hàngdiff.png";

    // Chụp ảnh thực tế và lưu lại
    await captureScreenshot(driver, actualPath);
    console.log(" Ảnh thực tế đã được chụp.");

    // So sánh ảnh và sinh ảnh khác biệt
    await compareImages(baselinePath, actualPath, diffPath);

    // So sánh văn bản giữa 2 ảnh
    await compareTextBetweenImages(baselinePath, "resized-actual.png");
  } catch (err) {
    console.error("Lỗi xảy ra:", err);
  } finally {
    await driver.quit();
  }
}

test();
