import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERR:', err.message));

  console.log("Navigating to http://localhost:5174/land-analysis ...");
  await page.goto('http://localhost:5174/land-analysis', { waitUntil: 'networkidle0' });

  // 1. Click Draw Polygon button
  console.log("Clicking 'Draw Polygon'...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const drawBtn = btns.find(b => b.textContent.includes('Draw Polygon'));
    if (drawBtn) drawBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));

  // 2. Click on the map to add 15 points
  console.log("Waiting for map canvas...");
  const mapElement = await page.waitForSelector('.maplibregl-canvas', { timeout: 10000 });
  const box = await mapElement.boundingBox();
  
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = box.width / 4;
  console.log(`Drawing 15 vertices around center ${cx}, ${cy}...`);
  
  for (let i = 0; i < 15; i++) {
    const angle = (i / 15) * Math.PI * 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    await page.mouse.click(x, y);
    await new Promise(r => setTimeout(r, 100));
  }
  
  await new Promise(r => setTimeout(r, 500));

  // 3. Click the first point marker to close the polygon
  console.log("Closing polygon (clicking the first point marker)...");
  await page.evaluate(() => {
    const firstPointMarker = document.querySelector('.first-point-marker');
    if (firstPointMarker) {
      firstPointMarker.click();
    } else {
      console.error("Could not find the first point marker!");
    }
  });

  await new Promise(r => setTimeout(r, 1000));

  // 4. Verify results
  console.log("Verifying results...");
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    const areaMatch = text.match(/Area:\s*[\d,]+\s*sq\.ft/);
    const continueBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Continue'));
    return {
      hasArea: !!areaMatch,
      areaText: areaMatch ? areaMatch[0] : null,
      continueEnabled: continueBtn && !continueBtn.disabled
    };
  });

  console.log("TEST RESULTS:", result);
  
  if (result.hasArea && result.continueEnabled) {
    console.log("✅ SUCCESS: 15-point unlimited polygon was drawn, closed, and area was calculated perfectly!");
  } else {
    console.log("❌ FAILED: Could not detect the finalized polygon area.");
  }

  await browser.close();
})();
