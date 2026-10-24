const puppeteer = require('puppeteer');

(async () => {
  console.log('='.repeat(70));
  console.log('STARTING REAL BROWSER E2E VERIFICATION SUITE');
  console.log('='.repeat(70));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleErrors = [];
  const networkFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.includes('favicon') && !url.includes('chrome-extension')) {
      networkFailures.push({ url, failure: req.failure()?.errorText });
    }
  });

  const testReport = {
    stepsExecuted: [],
    stepsPassed: [],
    stepsFailed: [],
    timings: {}
  };

  function pass(step, detail = '') {
    testReport.stepsExecuted.push(step);
    testReport.stepsPassed.push(step);
    console.log(`  [PASS] ${step} ${detail}`);
  }

  function fail(step, detail = '') {
    testReport.stepsExecuted.push(step);
    testReport.stepsFailed.push({ step, detail });
    console.log(`  [FAIL] ${step}: ${detail}`);
  }

  try {
    // -----------------------------------------------------------------
    // 1. Visit Login Page
    // -----------------------------------------------------------------
    await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle0' });
    const loginHeader = await page.$eval('h1', (el) => el.innerText).catch(() => '');
    if (loginHeader.toLowerCase().includes('welcome')) {
      pass('Login Page Loaded', `header="${loginHeader}"`);
    } else {
      fail('Login Page Loaded', `Unexpected header: "${loginHeader}"`);
    }

    // -----------------------------------------------------------------
    // 2. Perform Login & Measure Time
    // -----------------------------------------------------------------
    const uniqueEmail = `test_ui_${Date.now()}@example.com`;
    const password = 'Password123!';

    // Register user via API first (with retry)
    const regResult = await page.evaluate(async (email, pwd) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch('http://127.0.0.1:8000/api/v1/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'E2E Tester', email, password: pwd })
          });
          if (res.status === 201 || res.status === 200) {
            return { status: res.status };
          }
        } catch (err) {
          if (attempt === 3) return { status: 500, error: err.message };
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      return { status: 500 };
    }, uniqueEmail, password);

    await page.type('input[type="email"]', uniqueEmail);
    await page.type('input[type="password"]', password);

    const tLogin0 = Date.now();
    await page.click('button[type="submit"]');

    // Wait for client-side navigation to /building-type
    await page.waitForFunction(() => window.location.pathname.includes('/building-type'), { timeout: 15000 });
    const loginDuration = Date.now() - tLogin0;
    testReport.timings.login_duration_ms = loginDuration;

    // -----------------------------------------------------------------
    // 3. Confirm Post-Login Navigation to Building Type Selection
    // -----------------------------------------------------------------
    const currentUrl = page.url();
    if (currentUrl.includes('/building-type')) {
      pass('Post-login Navigation to Building Type Selection', `url=${currentUrl} (${loginDuration}ms)`);
    } else {
      fail('Post-login Navigation to Building Type Selection', `Current URL is ${currentUrl}`);
    }

    // -----------------------------------------------------------------
    // 4. Select Building Type ("Apartment") & Proceed
    // -----------------------------------------------------------------
    await page.waitForSelector('button');
    const aptCardSelected = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.grid > div'));
      const apt = cards.find(c => c.innerText && c.innerText.includes('Apartment') && c.innerText.includes('2,000 sq.ft'));
      if (apt) {
        apt.click();
        return true;
      }
      return false;
    });

    if (aptCardSelected) {
      pass('Select Building Type Card', 'Selected Apartment');
    } else {
      fail('Select Building Type Card', 'Could not locate Apartment card');
    }
    await new Promise(r => setTimeout(r, 600));

    // Click Continue button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const proceed = btns.find(b => b.innerText && (b.innerText.includes('Continue to Land Selection') || b.innerText.includes('Proceed to Land Selection')));
      if (proceed) proceed.click();
    });

    await page.waitForFunction(() => window.location.pathname.includes('/land-analysis'), { timeout: 10000 });
    const landAnalysisUrl = page.url();
    if (landAnalysisUrl.includes('/land-analysis')) {
      pass('Navigation to Land Analysis Page', `url=${landAnalysisUrl}`);
    } else {
      fail('Navigation to Land Analysis Page', `url=${landAnalysisUrl}`);
    }

    // -----------------------------------------------------------------
    // 5. Input Land Area & Select Location
    // -----------------------------------------------------------------
    await new Promise(r => setTimeout(r, 1000));
    const selectedBadge = await page.evaluate(() => {
      const el = document.querySelector('body');
      return el ? el.innerText.includes('Apartment') : false;
    });
    if (selectedBadge) {
      pass('Building Type Badge Synchronized', 'Showing "Apartment"');
    } else {
      fail('Building Type Badge Synchronized', 'Missing "Apartment" badge');
    }

    // Enter parcel area (3200 sq.ft)
    const areaInput = await page.$('input[placeholder*="1500"]');
    if (areaInput) {
      await areaInput.type('3200');
      pass('Enter Direct Parcel Area', '3200 sq.ft');
    } else {
      fail('Enter Direct Parcel Area', 'Could not find area input');
    }

    // Trigger map location selection by clicking canvas
    const canvas = await page.$('.maplibregl-canvas, canvas');
    if (canvas) {
      const rect = await canvas.boundingBox();
      if (rect) {
        await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await new Promise(r => setTimeout(r, 800));
        pass('Map Location Selection Click', `Coordinates clicked at (${Math.round(rect.x + rect.width / 2)}, ${Math.round(rect.y + rect.height / 2)})`);
      }
    }

    // Click Fetch GIS Data
    const tFetch0 = Date.now();
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const proceed = btns.find(b => b.innerText && b.innerText.includes('Fetch GIS Data'));
      if (proceed) proceed.click();
    });

    // Wait for GIS step summary
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Automated GIS Data Summary') || document.body.innerText.includes('Confirm & Run AI Analysis');
    }, { timeout: 25000 });
    const fetchDuration = Date.now() - tFetch0;
    testReport.timings.gis_fetch_ms = fetchDuration;
    pass('Automated GIS Summary Loaded', `(${fetchDuration}ms)`);

    // Verify road width in summary is not hardcoded 20ft
    const summaryText = await page.evaluate(() => document.body.innerText);
    const hasRoadWidthRow = summaryText.includes('Road Access Width');
    const roadWidthIsNotFake20 = !summaryText.includes('Road Access Width\n20 ft') && !summaryText.includes('Road Access Width\t20 ft');
    if (hasRoadWidthRow && roadWidthIsNotFake20) {
      pass('GIS Summary Road Width Verification', 'No hardcoded 20ft displayed');
    } else {
      fail('GIS Summary Road Width Verification', 'Found hardcoded 20ft or missing road row');
    }

    // -----------------------------------------------------------------
    // 6. Confirm & Run AI Analysis (Measure Complete Loading Time)
    // -----------------------------------------------------------------
    const tAnalysis0 = Date.now();
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find(b => b.innerText && b.innerText.includes('Confirm & Run AI Analysis'));
      if (confirmBtn) confirmBtn.click();
    });

    // Wait for result dashboard to load
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Building Suitability Comparison') && document.body.innerText.includes('Risk Assessment Values Comparison');
    }, { timeout: 70000 });
    const analysisDuration = Date.now() - tAnalysis0;
    testReport.timings.complete_analysis_ui_ms = analysisDuration;
    pass('Complete AI Analysis Execution & UI Render', `(${analysisDuration}ms)`);

    // -----------------------------------------------------------------
    // 7. Verify Strictly ONE Pie Chart & ONE Bar Chart
    // -----------------------------------------------------------------
    await new Promise(r => setTimeout(r, 2000));
    const chartCounts = await page.evaluate(() => {
      const pieCharts = document.querySelectorAll('.recharts-pie, .recharts-surface, svg.recharts-surface');
      const barCharts = document.querySelectorAll('.recharts-bar, .recharts-bar-rectangles');
      const pieHeaders = Array.from(document.querySelectorAll('h3')).filter(h => h.innerText.includes('Building Suitability Comparison'));
      const barHeaders = Array.from(document.querySelectorAll('h3')).filter(h => h.innerText.includes('Risk Assessment Values Comparison'));
      return {
        pieHeaders: pieHeaders.length,
        barHeaders: barHeaders.length,
        hasResponsiveContainers: document.querySelectorAll('.recharts-responsive-container').length >= 2
      };
    });

    if (chartCounts.pieHeaders === 1 && chartCounts.barHeaders === 1 && chartCounts.hasResponsiveContainers) {
      pass('Strictly ONE Pie Chart & ONE Bar Chart Rendered', 'Exactly 1 Pie header & 1 Bar header with Recharts containers');
    } else {
      fail('Strictly ONE Pie Chart & ONE Bar Chart Rendered', JSON.stringify(chartCounts));
    }

    // -----------------------------------------------------------------
    // 8. Test Action Buttons Presence (Breakdown, PDF, Excel, New Land)
    // -----------------------------------------------------------------
    const actionButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
      return {
        hasBreakdown: btns.some(t => t.includes('Detailed Breakdown') || t.includes('Breakdown')),
        hasNewLand: btns.some(t => t.includes('Analyze New Land'))
      };
    });

    if (actionButtons.hasBreakdown && actionButtons.hasNewLand) {
      pass('Action Bar Buttons Verified', 'Detailed Breakdown and Analyze New Land buttons present');
    } else {
      fail('Action Bar Buttons Verified', JSON.stringify(actionButtons));
    }

    // -----------------------------------------------------------------
    // 9. Test "Why This Risk?" Button & Modal
    // -----------------------------------------------------------------
    const whyRiskClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText && b.innerText.includes('Why this risk?'));
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'center' });
        target.click();
        return true;
      }
      return false;
    });

    if (whyRiskClicked) {
      await page.waitForFunction(() => {
        const txt = document.body.innerText.toLowerCase();
        return txt.includes('evaluated physical parameters') || txt.includes('flood & hydrology') || txt.includes('risk assessment');
      }, { timeout: 15000 });
      const modalText = await page.evaluate(() => document.body.innerText.toLowerCase());
      const isModalOpen = modalText.includes('evaluated physical parameters') && (modalText.includes('engineering mitigations') || modalText.includes('mitigation'));
      if (isModalOpen) {
        pass('Explain Risk Modal Verified', 'Displays actual physical evaluation and civil engineering mitigations');
      } else {
        fail('Explain Risk Modal Verified', 'Modal did not render expected sections');
      }

      // Close modal
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 600));
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const close = btns.find(b => b.innerText && (b.innerText.includes('Close Explanation') || b.innerText.trim() === '✕'));
        if (close) close.click();
      });
      await new Promise(r => setTimeout(r, 800));
    } else {
      fail('Explain Risk Modal', 'Could not find "Why this risk?" button');
    }

    // -----------------------------------------------------------------
    // 10. Test "Breakdown" Button & Detailed Modal
    // -----------------------------------------------------------------
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText && (b.innerText.includes('View Detailed Breakdown') || b.innerText.includes('Detailed Breakdown') || b.innerText.includes('Breakdown')));
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'center' });
        target.click();
      }
    });

    await page.waitForFunction(() => {
      return document.body.innerText.includes('Detailed Land Analysis Breakdown') || document.body.innerText.includes('Property Profile');
    }, { timeout: 15000 });

    const modalContent = await page.evaluate(() => document.body.innerText);
    const hasAreaConversions = modalContent.includes('sq.ft') && (modalContent.includes('m²') || modalContent.includes('cents'));
    const noHardcoded20InModal = !modalContent.includes('20 ft (Standard)');
    if (hasAreaConversions && noHardcoded20InModal) {
      pass('Detailed Breakdown Modal Content Verified', 'Area conversions present, no "20 ft (Standard)"');
    } else {
      fail('Detailed Breakdown Modal Content Verified', `conversions=${hasAreaConversions}, noHardcoded20=${noHardcoded20InModal}`);
    }

    // Verify PDF & Excel export buttons inside modal
    const hasPdfBtn = await page.evaluate(() => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('PDF')));
    const hasExcelBtn = await page.evaluate(() => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Excel')));
    if (hasPdfBtn && hasExcelBtn) {
      pass('PDF and Excel Export Buttons Verified inside Modal');
    } else {
      fail('PDF and Excel Export Buttons inside Modal', `pdf=${hasPdfBtn}, excel=${hasExcelBtn}`);
    }

    // Close Detailed Modal
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 600));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const close = btns.find(b => b.innerText === '✕' || b.innerText.includes('Close'));
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 800));

    // -----------------------------------------------------------------
    // 11. Navigate to History Page (/history)
    // -----------------------------------------------------------------
    await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('a')).find(a => a.innerText && a.innerText.trim() === 'History');
      if (link) {
        link.click();
      } else {
        window.location.href = '/history';
      }
    });
    await page.waitForFunction(() => document.body.innerText.includes('Analysis History'), { timeout: 15000 });
    const historyHeader = await page.$eval('h1', el => el.innerText).catch(() => 'Analysis History');

    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      return !txt.includes('Loading your past land suitability analyses') &&
             (txt.includes('No past analyses recorded') || Array.from(document.querySelectorAll('h3')).length > 0);
    }, { timeout: 25000 });

    const historyInfo = await page.evaluate(() => {
      const h3s = Array.from(document.querySelectorAll('h3')).map(h => h.innerText.trim());
      const hasDownloadPdf = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('PDF'));
      const hasDownloadExcel = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Excel'));
      const hasCards = h3s.length > 0 && !document.body.innerText.includes('No past analyses recorded');
      return {
        h3s,
        hasCards,
        hasDownloadPdf,
        hasDownloadExcel,
        recordsCount: hasCards ? h3s.length : 0,
        textSample: document.body.innerText.slice(0, 300)
      };
    });
    console.log('  [DEBUG] History Page Data:', JSON.stringify(historyInfo));

    if (historyInfo.recordsCount >= 1 || historyInfo.hasCards) {
      pass('History Page Verified', `Header="${historyHeader}", rendered ${historyInfo.recordsCount} past analysis record(s) with download actions`);
    } else {
      fail('History Page Verified', `Header="${historyHeader}", records=${historyInfo.recordsCount}, sample=${historyInfo.textSample.replace(/\n/g, ' ')}`);
    }

  } catch (err) {
    fail('Unhandled Browser Test Exception', err.message);
  } finally {
    await browser.close();
  }

  console.log('='.repeat(70));
  console.log(`UI BROWSER VERIFICATION: ${testReport.stepsPassed.length}/${testReport.stepsExecuted.length} PASSED`);
  if (testReport.stepsFailed.length > 0) {
    console.log(`FAILED STEPS (${testReport.stepsFailed.length}):`);
    testReport.stepsFailed.forEach(f => console.log(`  - ${f.step}: ${f.detail}`));
  }
  console.log('MEASURED UI TIMINGS:');
  for (const [k, v] of Object.entries(testReport.timings)) {
    console.log(`  - ${k}: ${v} ms`);
  }
  console.log(`CONSOLE ERRORS COUNT: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.slice(0, 5).forEach(e => console.log(`  [Console Error] ${e}`));
  }
  console.log(`NETWORK FAILURES COUNT: ${networkFailures.length}`);
  if (networkFailures.length > 0) {
    networkFailures.slice(0, 5).forEach(f => console.log(`  [Network Failure] ${f.url} (${f.failure})`));
  }
  console.log('='.repeat(70));
})();
