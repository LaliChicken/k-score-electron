const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const AdmZip = require("adm-zip");
const autocorrect = require("autocorrect")(); // default word-list dictionary

let mainWindow;

// PHQ-9 & GAD-7 question texts for CSV/PDF exports
const PHQ9_ITEMS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the news or watching TV",
  "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead, or of hurting yourself in some way"
];

const GAD7_ITEMS = [
  "Feeling nervous, anxious or on edge",
  "Not being able to stop or control worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritable",
  "Feeling afraid as if something awful might happen"
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * CSV helper
 */
function toCsvRow(fields) {
  return fields
    .map((f) => {
      if (f === null || f === undefined) return "";
      const str = String(f);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(",");
}

/**
 * Render HTML to PDF using a hidden BrowserWindow
 */
async function renderHtmlToPdf(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true
    }
  });

  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

  const pdfBuffer = await win.webContents.printToPDF({
    marginsType: 1,
    printBackground: true,
    pageSize: "A4"
  });

  win.destroy();
  return pdfBuffer;
}

/**
 * Build Consent PDF HTML
 */
function buildConsentHtml(payload) {
  const { participantId, consent } = payload;
  const signedAt = consent.signedAt || "";
  const fullName = consent.fullName || "";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Consent - Participant ${participantId}</title>
<style>
  body { font-family: sans-serif; padding: 40px; line-height: 1.5; }
  h1, h2 { margin-bottom: 0.5em; }
  .section { margin-bottom: 1.5em; }
  .box { border: 1px solid #888; padding: 10px; margin-top: 0.5em; }
</style>
</head>
<body>
  <h1>Consent Form</h1>
  <div class="section">
    <strong>Participant ID:</strong> ${participantId}<br/>
    <strong>Name (electronic signature):</strong> ${fullName}<br/>
    <strong>Signed at:</strong> ${signedAt}
  </div>

  <div class="section">
    <h2>Typing / Keystroke Consent</h2>
    <div class="box">
      The participant agrees to take part in a typing study that logs keystroke timing, backspace use, and essay content using a local Electron application.
      Data will be stored under an anonymous participant ID.
      <br/><br/>
      <strong>Typing Consent Given:</strong> ${consent.typingConsent ? "Yes" : "No"}
    </div>
  </div>

  <div class="section">
    <h2>PHQ-9 and GAD-7 Consent</h2>
    <div class="box">
      The participant agrees to complete the PHQ-9 and GAD-7 self-report questionnaires, which include questions about mood, anxiety, and related symptoms.
      These questionnaires are used as research measures only and do not provide a diagnosis.
      <br/><br/>
      <strong>PHQ-9 / GAD-7 Consent Given:</strong> ${consent.phqGadConsent ? "Yes" : "No"}
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Build PHQ-9 PDF HTML (with question text)
 */
function buildPhqHtml(payload) {
  const { participantId, phq9 } = payload;

  if (!phq9 || !Array.isArray(phq9.itemScores)) {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>PHQ-9 - Participant ${participantId}</title></head>
<body>
  <h1>PHQ-9</h1>
  <p>No PHQ-9 data.</p>
</body>
</html>`;
  }

  const choices = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

  const itemsHtml = phq9.itemScores
    .map((score, idx) => {
      const display = choices[score] ?? `Score ${score}`;
      const question = PHQ9_ITEMS[idx] || "";
      return `<tr>
        <td>${idx + 1}</td>
        <td>${question}</td>
        <td>${score}</td>
        <td>${display}</td>
      </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>PHQ-9 - Participant ${participantId}</title>
<style>
  body { font-family: sans-serif; padding: 40px; line-height: 1.5; }
  h1, h2 { margin-bottom: 0.5em; }
  table { border-collapse: collapse; margin-bottom: 1em; width: 100%; }
  th, td { border: 1px solid #888; padding: 4px 6px; vertical-align: top; }
</style>
</head>
<body>
  <h1>PHQ-9 Responses</h1>
  <p><strong>Participant ID:</strong> ${participantId}</p>
  <table>
    <tr>
      <th>Item</th>
      <th>Question</th>
      <th>Score</th>
      <th>Response</th>
    </tr>
    ${itemsHtml}
    <tr>
      <td colspan="4"><strong>Total Score:</strong> ${phq9.totalScore ?? ""}</td>
    </tr>
  </table>
  <p><strong>Difficulty:</strong> ${phq9.difficulty || "N/A"}</p>
</body>
</html>
`;
}

/**
 * Build GAD-7 PDF HTML (with question text)
 */
function buildGadHtml(payload) {
  const { participantId, gad7 } = payload;

  if (!gad7 || !Array.isArray(gad7.itemScores)) {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>GAD-7 - Participant ${participantId}</title></head>
<body>
  <h1>GAD-7</h1>
  <p>No GAD-7 data.</p>
</body>
</html>`;
  }

  const choices = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

  const itemsHtml = gad7.itemScores
    .map((score, idx) => {
      const display = choices[score] ?? `Score ${score}`;
      const question = GAD7_ITEMS[idx] || "";
      return `<tr>
        <td>${idx + 1}</td>
        <td>${question}</td>
        <td>${score}</td>
        <td>${display}</td>
      </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>GAD-7 - Participant ${participantId}</title>
<style>
  body { font-family: sans-serif; padding: 40px; line-height: 1.5; }
  h1, h2 { margin-bottom: 0.5em; }
  table { border-collapse: collapse; margin-bottom: 1em; width: 100%; }
  th, td { border: 1px solid #888; padding: 4px 6px; vertical-align: top; }
</style>
</head>
<body>
  <h1>GAD-7 Responses</h1>
  <p><strong>Participant ID:</strong> ${participantId}</p>
  <table>
    <tr>
      <th>Item</th>
      <th>Question</th>
      <th>Score</th>
      <th>Response</th>
    </tr>
    ${itemsHtml}
    <tr>
      <td colspan="4"><strong>Total Score:</strong> ${gad7.totalScore ?? ""}</td>
    </tr>
  </table>
  <p><strong>Difficulty:</strong> ${gad7.difficulty || "N/A"}</p>
</body>
</html>
`;
}

/**
 * Autocorrect IPC: takes a single word (highlighted selection),
 * returns original, corrected, and whether it changed.
 */
ipcMain.handle("autocorrect-text", async (event, word) => {
  if (typeof word !== "string" || word.trim() === "") {
    return { original: word || "", corrected: word || "", changed: false };
  }

  const corrected = autocorrect(word);
  const changed = typeof corrected === "string" && corrected !== word;

  return {
    original: word,
    corrected: changed ? corrected : word,
    changed
  };
});

/**
 * Handle export-all: build CSVs + PDFs and bundle into a ZIP file
 */
ipcMain.handle("export-all", async (event, payload) => {
  const {
    participantId,
    consent,
    keystrokes,
    summaries,
    phq9,
    gad7,
    autocorrectEvents
  } = payload;

  const saveResult = await dialog.showSaveDialog({
    title: "Save participant ZIP",
    defaultPath: `participant_${participantId}.zip`,
    filters: [{ name: "ZIP files", extensions: ["zip"] }]
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { success: false, error: "User canceled" };
  }

  const zip = new AdmZip();

  // 1. Keystrokes CSV
  {
    const header = [
      "participantId",
      "phase",
      "timestampMs",
      "key",
      "code",
      "isBackspace",
      "isCharacter"
    ];
    const rows = [toCsvRow(header)];
    (keystrokes || []).forEach((e) => {
      rows.push(
        toCsvRow([
          e.participantId,
          e.phase,
          e.timestampMs,
          e.key,
          e.code,
          e.isBackspace,
          e.isCharacter
        ])
      );
    });
    zip.addFile(
      `participant_${participantId}_keystrokes.csv`,
      Buffer.from(rows.join("\n"), "utf8")
    );
  }

  // 2. Summaries CSV
  {
    const header = [
      "participantId",
      "phase",
      "totalKeys",
      "totalBackspaces",
      "backspaceRate",
      "medianIkiMs",
      "meanIkiMs",
      "durationMs"
    ];
    const rows = [toCsvRow(header)];
    (summaries || []).forEach((s) => {
      rows.push(
        toCsvRow([
          s.participantId,
          s.phase,
          s.totalKeys,
          s.totalBackspaces,
          s.backspaceRate,
          s.medianIkiMs,
          s.meanIkiMs,
          s.durationMs
        ])
      );
    });
    zip.addFile(
      `participant_${participantId}_summaries.csv`,
      Buffer.from(rows.join("\n"), "utf8")
    );
  }

  // 3. Autocorrect events CSV: word-level
  {
    const header = [
      "participantId",
      "phase",
      "timestampMs",
      "originalWord",
      "correctedWord",
      "changed"
    ];
    const rows = [toCsvRow(header)];
    (autocorrectEvents || []).forEach((e) => {
      rows.push(
        toCsvRow([
          e.participantId,
          e.phase,
          e.timestampMs,
          e.originalWord,
          e.correctedWord,
          e.changed
        ])
      );
    });
    zip.addFile(
      `participant_${participantId}_autocorrect.csv`,
      Buffer.from(rows.join("\n"), "utf8")
    );
  }

  // 4. PHQ-9 CSV (with question text)
  if (phq9 && Array.isArray(phq9.itemScores)) {
    const header = [
      "participantId",
      "itemIndex",
      "questionText",
      "score",
      "difficulty",
      "totalScore"
    ];
    const rows = [toCsvRow(header)];
    phq9.itemScores.forEach((score, idx) => {
      rows.push(
        toCsvRow([
          participantId,
          idx + 1,
          PHQ9_ITEMS[idx] || "",
          score,
          idx === 0 ? phq9.difficulty : "",
          idx === 0 ? phq9.totalScore : ""
        ])
      );
    });
    zip.addFile(
      `participant_${participantId}_phq9.csv`,
      Buffer.from(rows.join("\n"), "utf8")
    );
  }

  // 5. GAD-7 CSV (with question text)
  if (gad7 && Array.isArray(gad7.itemScores)) {
    const header = [
      "participantId",
      "itemIndex",
      "questionText",
      "score",
      "difficulty",
      "totalScore"
    ];
    const rows = [toCsvRow(header)];
    gad7.itemScores.forEach((score, idx) => {
      rows.push(
        toCsvRow([
          participantId,
          idx + 1,
          GAD7_ITEMS[idx] || "",
          score,
          idx === 0 ? gad7.difficulty : "",
          idx === 0 ? gad7.totalScore : ""
        ])
      );
    });
    zip.addFile(
      `participant_${participantId}_gad7.csv`,
      Buffer.from(rows.join("\n"), "utf8")
    );
  }

  // 6. Combined summary metric (PHQ-9 + GAD-7)
  {
    const phqTotal =
      phq9 && typeof phq9.totalScore === "number" ? phq9.totalScore : "";
    const gadTotal =
      gad7 && typeof gad7.totalScore === "number" ? gad7.totalScore : "";
    const combined =
      typeof phqTotal === "number" && typeof gadTotal === "number"
        ? phqTotal + gadTotal
        : "";

    const header = ["participantId", "phq9_total", "gad7_total", "phq9_plus_gad7"];
    const rows = [toCsvRow(header)];
    rows.push(toCsvRow([participantId, phqTotal, gadTotal, combined]));
    zip.addFile(
      `participant_${participantId}_phq_gad_summary.csv`,
      Buffer.from(rows.join("\n"), "utf8")
    );
  }

  // 7. Consent PDF
  const consentHtml = buildConsentHtml(payload);
  const consentPdf = await renderHtmlToPdf(consentHtml);
  zip.addFile(
    `participant_${participantId}_consent.pdf`,
    consentPdf
  );

  // 8. PHQ-9 PDF
  const phqHtml = buildPhqHtml(payload);
  const phqPdf = await renderHtmlToPdf(phqHtml);
  zip.addFile(
    `participant_${participantId}_phq9.pdf`,
    phqPdf
  );

  // 9. GAD-7 PDF
  const gadHtml = buildGadHtml(payload);
  const gadPdf = await renderHtmlToPdf(gadHtml);
  zip.addFile(
    `participant_${participantId}_gad7.pdf`,
    gadPdf
  );

  // Write ZIP
  zip.writeZip(saveResult.filePath);

  return { success: true, file: saveResult.filePath };
});
