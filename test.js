import { Builder, By } from "selenium-webdriver";
import fs from "fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

async function captureScreenshot(driver, filename) {
  let image = await driver.takeScreenshot();
  fs.writeFileSync(filename, image, "base64");
}

async function compareImages(img1Path, img2Path, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(img1Path));
  const img2 = PNG.sync.read(fs.readFileSync(img2Path));
  const { width, height } = img1;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );

  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  console.log(`Số pixel khác biệt: ${numDiffPixels}`);
}

async function test() {
  let driver = await new Builder().forBrowser("chrome").build();

  try {
    await driver.get("https://pibook.vn/");

    // Chụp ảnh màn hình lần 1 (ảnh thiết kế ban đầu)
    await captureScreenshot(driver, "baseline.png");
    console.log("Ảnh thiết kế ban đầu đã được chụp.");

    // Chờ một số thay đổi (tuỳ theo test case của bạn)
    await driver.navigate().refresh();
    await driver.sleep(2000);

    // Chụp ảnh màn hình lần 2 (ảnh thực tế)
    await captureScreenshot(driver, "actual.png");
    console.log("Ảnh thực tế đã được chụp.");

    // So sánh ảnh thiết kế ban đầu và ảnh thực tế
    await compareImages("baseline.png", "actual.png", "diff.png");
    console.log("So sánh hoàn tất. Kiểm tra file diff.png.");
  } finally {
    await driver.quit();
  }
}

test();
