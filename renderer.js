// Simple ID helper
function generateParticipantId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return "p_" + Math.random().toString(36).slice(2, 10);
}

const initialState = {
  participantId: generateParticipantId(),
  screen: "welcome", // welcome | consent | baseline | essay | phq9 | gad7 | review
  consent: {
    typingConsent: false,
    phqGadConsent: false,
    fullName: "",
    signedAt: ""
  },
  keystrokes: [],
  summaries: [],
  autocorrectEvents: [],
  currentPhase: null, // "baseline" | "essay"
  phaseStartTime: null,
  lastKeyTime: null,
  essayText: "",
  phq9: {
    itemScores: Array(9).fill(null),
    difficulty: null,
    totalScore: null
  },
  gad7: {
    itemScores: Array(7).fill(null),
    difficulty: null,
    totalScore: null
  }
};

let state = { ...initialState };

const appEl = document.getElementById("app");

// PHQ-9 and GAD-7 definitions (for UI only)
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

const FOUR_POINT_CHOICES = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" }
];

const DIFFICULTY_CHOICES = [
  { value: "not_difficult", label: "Not difficult at all" },
  { value: "somewhat", label: "Somewhat difficult" },
  { value: "very", label: "Very difficult" },
  { value: "extremely", label: "Extremely difficult" }
];

function setState(partial) {
  state = { ...state, ...partial };
  render();
}

function attachTypingListeners(enable) {
  const textarea = document.getElementById("typingBox");
  if (!textarea) return;

  if (!enable) {
    textarea.onkeydown = null;
    textarea.oninput = null;
    return;
  }

  // No setState calls in here -> avoids focus loss on every key
  textarea.onkeydown = (e) => {
    const now = performance.now();
    if (state.phaseStartTime == null) {
      return;
    }

    const timestampMs = now - state.phaseStartTime;

    const isBackspace = e.key === "Backspace" ? 1 : 0;
    const isCharacter =
      e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey ? 1 : 0;

    state.keystrokes.push({
      participantId: state.participantId,
      phase: state.currentPhase,
      timestampMs: Math.round(timestampMs),
      key: e.key,
      code: e.code,
      isBackspace,
      isCharacter
    });

    state.lastKeyTime = now;
  };

  textarea.oninput = (e) => {
    if (state.currentPhase === "essay") {
      state.essayText = e.target.value;
    }
  };

  textarea.focus();
}

// compute summary stats for a phase
function computePhaseSummary(phase) {
  const events = state.keystrokes.filter((e) => e.phase === phase);
  if (events.length === 0) {
    return {
      participantId: state.participantId,
      phase,
      totalKeys: 0,
      totalBackspaces: 0,
      backspaceRate: 0,
      medianIkiMs: 0,
      meanIkiMs: 0,
      durationMs: 0
    };
  }

  const totalKeys = events.length;
  const totalBackspaces = events.filter((e) => e.isBackspace === 1).length;
  const backspaceRate = totalKeys > 0 ? totalBackspaces / totalKeys : 0;

  const sorted = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  const ikis = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].timestampMs - sorted[i - 1].timestampMs;
    if (diff >= 0) ikis.push(diff);
  }

  let medianIkiMs = 0;
  let meanIkiMs = 0;
  if (ikis.length > 0) {
    const sortedIki = ikis.slice().sort((a, b) => a - b);
    const mid = Math.floor(sortedIki.length / 2);
    if (sortedIki.length % 2 === 0) {
      medianIkiMs = (sortedIki[mid - 1] + sortedIki[mid]) / 2;
    } else {
      medianIkiMs = sortedIki[mid];
    }
    const sumIki = ikis.reduce((a, b) => a + b, 0);
    meanIkiMs = sumIki / ikis.length;
  }

  const durationMs =
    sorted[sorted.length - 1].timestampMs - sorted[0].timestampMs;

  return {
    participantId: state.participantId,
    phase,
    totalKeys,
    totalBackspaces,
    backspaceRate,
    medianIkiMs: Math.round(medianIkiMs),
    meanIkiMs: Math.round(meanIkiMs),
    durationMs: Math.round(durationMs)
  };
}

function endBaseline() {
  attachTypingListeners(false);
  const summary = computePhaseSummary("baseline");
  const newSummaries = [
    ...state.summaries.filter((s) => s.phase !== "baseline"),
    summary
  ];
  state.summaries = newSummaries;
  state.currentPhase = null;
  state.phaseStartTime = null;
  state.lastKeyTime = null;

  setState({
    summaries: state.summaries,
    screen: "essay"
  });
}

function endEssay() {
  attachTypingListeners(false);
  const textarea = document.getElementById("typingBox");
  if (textarea) {
    state.essayText = textarea.value;
  }

  const summary = computePhaseSummary("essay");
  const newSummaries = [
    ...state.summaries.filter((s) => s.phase !== "essay"),
    summary
  ];

  state.summaries = newSummaries;
  state.currentPhase = null;
  state.phaseStartTime = null;
  state.lastKeyTime = null;

  setState({
    summaries: state.summaries,
    screen: "phq9"
  });
}

function computePhqTotal() {
  const scores = state.phq9.itemScores;
  if (scores.some((s) => s === null)) return null;
  return scores.reduce((a, b) => a + b, 0);
}

function computeGadTotal() {
  const scores = state.gad7.itemScores;
  if (scores.some((s) => s === null)) return null;
  return scores.reduce((a, b) => a + b, 0);
}

async function handleExport() {
  const payload = {
    participantId: state.participantId,
    consent: state.consent,
    keystrokes: state.keystrokes,
    summaries: state.summaries,
    essayText: state.essayText,
    phq9: {
      participantId: state.participantId,
      itemScores: state.phq9.itemScores,
      difficulty: state.phq9.difficulty,
      totalScore: state.phq9.totalScore
    },
    gad7: {
      participantId: state.participantId,
      itemScores: state.gad7.itemScores,
      difficulty: state.gad7.difficulty,
      totalScore: state.gad7.totalScore
    },
    autocorrectEvents: state.autocorrectEvents
  };

  const result = await window.electronAPI.exportAll(payload);
  if (result && result.success) {
    alert("Exported successfully:\n" + result.file);
  } else {
    alert("Export canceled or failed.");
  }
}

// ---------- RENDERING ----------

function renderWelcome() {
  return `
    <div class="card">
      <h1>K-Score Typing Study</h1>
      <p>
        This app runs a two-part typing task and then asks you to complete the PHQ-9 and GAD-7 questionnaires.
        Your keystrokes and responses are saved under an anonymous participant ID.
      </p>
      <p><strong>Participant ID:</strong> ${state.participantId}</p>
      <button class="primary" id="btnStart">Begin</button>
    </div>
  `;
}

function renderConsent() {
  const c = state.consent;
  const canContinue =
    c.typingConsent && c.phqGadConsent && c.fullName.trim().length > 0;

  return `
    <div class="card">
      <h2>Consent & E-Signature</h2>
      <p>
        Please read each section and indicate your agreement.
        This is for a low-risk research study on typing patterns, mood, and anxiety.
      </p>

      <div class="card">
        <h3>Typing / Keystroke Logging</h3>
        <p>
          I understand that this app will record my keystrokes, including timing, backspaces,
          and the text I type during the baseline and essay phases. Data are stored under an anonymous ID.
        </p>
        <label>
          <input type="checkbox" id="typingConsent" ${
            c.typingConsent ? "checked" : ""
          } />
          I agree to participate in the typing part of this study.
        </label>
      </div>

      <div class="card">
        <h3>PHQ-9 and GAD-7 Questionnaires</h3>
        <p>
          PHQ-9 and GAD-7 are standard questionnaires about depression and anxiety symptoms over the past two weeks.
          Some items may be sensitive. This is for research only and does not provide a diagnosis.
        </p>
        <label>
          <input type="checkbox" id="phqGadConsent" ${
            c.phqGadConsent ? "checked" : ""
          } />
          I agree to answer the PHQ-9 and GAD-7 questionnaires.
        </label>
      </div>

      <div class="card">
        <h3>Electronic Signature</h3>
        <div class="input-row">
          <label>
            Full name (acts as your electronic signature)
            <input type="text" id="fullName" value="${c.fullName}" />
          </label>
        </div>
        <p>
          By typing my name and clicking Continue, I am providing my electronic signature for this study.
        </p>
      </div>

      <button class="secondary" id="btnBackWelcome">Back</button>
      <button class="primary" id="btnConsentContinue" ${
        canContinue ? "" : "disabled"
      }>Continue to Typing</button>
    </div>
  `;
}

function renderBaseline() {
  return `
    <div class="card">
      <h2>Baseline Typing (Neutral)</h2>
      <p>
        Please type normally for about 2 minutes in response to the neutral prompt below.
        This is just to measure your typical typing speed and editing behaviour.
      </p>
      <p><strong>Prompt:</strong> Describe a typical school day in as much detail as you like.</p>
      <textarea id="typingBox" autofocus placeholder="Start typing here..."></textarea>
      <div style="margin-top: 8px;">
        <button class="secondary" id="btnBaselineAutocorrect">Autocorrect highlighted word</button>
        <button class="primary" id="btnEndBaseline">End Baseline</button>
      </div>
    </div>
  `;
}

function renderEssay() {
  return `
    <div class="card">
      <h2>Essay Phase (Feelings over the last 2 weeks)</h2>
      <p>
        Now, please write freely about your feelings and experiences over the last two weeks.
        You can write as much as you want. Try to be honest and detailed.
      </p>
      <p><strong>Prompt:</strong> "Describe all the feelings that you experienced within the past two weeks and explain why you experienced them."</p>
      <textarea id="typingBox" autofocus placeholder="Start typing here...">${state.essayText}</textarea>
      <div style="margin-top: 8px;">
        <button class="secondary" id="btnEssayAutocorrect">Autocorrect highlighted word</button>
        <button class="primary" id="btnEndEssay">End Essay</button>
      </div>
    </div>
  `;
}

function renderPhq9() {
  const scores = state.phq9.itemScores;
  const total = computePhqTotal();
  const diff = state.phq9.difficulty;

  const itemsHtml = PHQ9_ITEMS.map((text, idx) => {
    const name = `phq9_item_${idx}`;
    const selected = scores[idx];
    const radios = FOUR_POINT_CHOICES.map(
      (opt) => `
        <label>
          <input type="radio" name="${name}" value="${opt.value}" ${
        selected === opt.value ? "checked" : ""
      } />
          ${opt.label} (${opt.value})
        </label>
      `
    ).join("<br/>");

    return `
      <div class="card">
        <p><strong>${idx + 1}.</strong> ${text}</p>
        ${radios}
      </div>
    `;
  }).join("");

  const diffOptions = DIFFICULTY_CHOICES.map(
    (opt) => `
      <label>
        <input type="radio" name="phq9_difficulty" value="${opt.value}" ${
      diff === opt.value ? "checked" : ""
    } />
        ${opt.label}
      </label>
    `
  ).join("<br/>");

  const canContinue = total !== null && diff !== null;

  return `
    <div class="card">
      <h2>PHQ-9 (Last 2 Weeks)</h2>
      <p>
        Over the last 2 weeks, how often have you been bothered by any of the following problems?
      </p>
      ${itemsHtml}
      <div class="card">
        <p>
          If you checked off any problems, how difficult have these problems made it for you at work, home, or with other people?
        </p>
        ${diffOptions}
      </div>
      <p><strong>Current total (if complete):</strong> ${total ?? "N/A"}</p>
      <button class="secondary" id="btnBackEssay">Back to Essay</button>
      <button class="primary" id="btnPhq9Next" ${
        canContinue ? "" : "disabled"
      }>Continue to GAD-7</button>
    </div>
  `;
}

function renderGad7() {
  const scores = state.gad7.itemScores;
  const total = computeGadTotal();
  const diff = state.gad7.difficulty;

  const itemsHtml = GAD7_ITEMS.map((text, idx) => {
    const name = `gad7_item_${idx}`;
    const selected = scores[idx];
    const radios = FOUR_POINT_CHOICES.map(
      (opt) => `
        <label>
          <input type="radio" name="${name}" value="${opt.value}" ${
        selected === opt.value ? "checked" : ""
      } />
          ${opt.label} (${opt.value})
        </label>
      `
    ).join("<br/>");

    return `
      <div class="card">
        <p><strong>${idx + 1}.</strong> ${text}</p>
        ${radios}
      </div>
    `;
  }).join("");

  const diffOptions = DIFFICULTY_CHOICES.map(
    (opt) => `
      <label>
        <input type="radio" name="gad7_difficulty" value="${opt.value}" ${
      diff === opt.value ? "checked" : ""
    } />
        ${opt.label}
      </label>
    `
  ).join("<br/>");

  const canContinue = total !== null && diff !== null;

  return `
    <div class="card">
      <h2>GAD-7 (Last 2 Weeks)</h2>
      <p>
        Over the last 2 weeks, how often have you been bothered by the following problems?
      </p>
      ${itemsHtml}
      <div class="card">
        <p>
          If you checked off any problems, how difficult have these problems made it for you at work, home, or with other people?
        </p>
        ${diffOptions}
      </div>
      <p><strong>Current total (if complete):</strong> ${total ?? "N/A"}</p>
      <button class="secondary" id="btnBackPhq9">Back to PHQ-9</button>
      <button class="primary" id="btnGad7Next" ${
        canContinue ? "" : "disabled"
      }>Continue to Review</button>
    </div>
  `;
}

function renderReview() {
  const phqTotal =
    typeof state.phq9.totalScore === "number" ? state.phq9.totalScore : null;
  const gadTotal =
    typeof state.gad7.totalScore === "number" ? state.gad7.totalScore : null;
  const combined =
    phqTotal !== null && gadTotal !== null ? phqTotal + gadTotal : "N/A";

  return `
    <div class="card">
      <h2>Review & Export</h2>
      <p><strong>Participant ID:</strong> ${state.participantId}</p>
      <div class="card">
        <h3>Typing Summary</h3>
        <pre>${JSON.stringify(state.summaries, null, 2)}</pre>
      </div>
      <div class="card">
        <h3>PHQ-9</h3>
        <p>Total score (separate file): ${state.phq9.totalScore}</p>
      </div>
      <div class="card">
        <h3>GAD-7</h3>
        <p>Total score (separate file): ${state.gad7.totalScore}</p>
      </div>
      <div class="card">
        <h3>Combined Metric</h3>
        <p>PHQ-9 + GAD-7 combined: ${combined}</p>
        <p>(Exported as a single combined metric in a separate summary CSV.)</p>
      </div>
      <p>
        Export saves a single ZIP with:
        <ul>
          <li>Keystrokes CSV</li>
          <li>Summaries CSV</li>
          <li>Autocorrect events CSV</li>
          <li>PHQ-9 CSV (with question text)</li>
          <li>GAD-7 CSV (with question text)</li>
          <li>PHQ+GAD combined metric CSV</li>
          <li>Consent PDF</li>
          <li>PHQ-9 PDF</li>
          <li>GAD-7 PDF</li>
        </ul>
      </p>
      <button class="primary" id="btnExportAll">Export All (ZIP)</button>
    </div>
  `;
}

function render() {
  let html = "";

  switch (state.screen) {
    case "welcome":
      html = renderWelcome();
      break;
    case "consent":
      html = renderConsent();
      break;
    case "baseline":
      html = renderBaseline();
      break;
    case "essay":
      html = renderEssay();
      break;
    case "phq9":
      html = renderPhq9();
      break;
    case "gad7":
      html = renderGad7();
      break;
    case "review":
      html = renderReview();
      break;
  }

  appEl.innerHTML = html;

  // After DOM is set, attach handlers
  if (state.screen === "welcome") {
    document.getElementById("btnStart").onclick = () => {
      setState({ screen: "consent" });
    };
  }

  if (state.screen === "consent") {
    const typingConsentEl = document.getElementById("typingConsent");
    const phqGadConsentEl = document.getElementById("phqGadConsent");
    const fullNameEl = document.getElementById("fullName");
    const btnCont = document.getElementById("btnConsentContinue");
    const btnBack = document.getElementById("btnBackWelcome");

    function updateConsentButtonState() {
      const canContinue =
        state.consent.typingConsent &&
        state.consent.phqGadConsent &&
        state.consent.fullName.trim().length > 0;
      btnCont.disabled = !canContinue;
    }

    typingConsentEl.onchange = () => {
      state.consent.typingConsent = typingConsentEl.checked;
      updateConsentButtonState();
    };
    phqGadConsentEl.onchange = () => {
      state.consent.phqGadConsent = phqGadConsentEl.checked;
      updateConsentButtonState();
    };
    fullNameEl.oninput = () => {
      state.consent.fullName = fullNameEl.value;
      state.consent.signedAt = new Date().toISOString();
      updateConsentButtonState();
    };

    fullNameEl.focus();

    btnCont.onclick = () => {
      setState({
        screen: "baseline",
        currentPhase: "baseline",
        phaseStartTime: performance.now(),
        lastKeyTime: null
      });
    };
    btnBack.onclick = () => {
      setState({ screen: "welcome" });
    };
  }

if (state.screen === "baseline") {
  const btnEndBaseline = document.getElementById("btnEndBaseline");
  const btnBaselineAutocorrect = document.getElementById(
    "btnBaselineAutocorrect"
  );
  const textarea = document.getElementById("typingBox");

  attachTypingListeners(true);

  btnEndBaseline.onclick = () => {
    endBaseline();
  };

    btnBaselineAutocorrect.onclick = async () => {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start == null || end == null || start === end) {
      alert("Please highlight a single word to autocorrect.");
      // give focus back so you can keep typing
      textarea.focus();
      const caret = textarea.value.length;
      textarea.setSelectionRange(caret, caret);
      return;
    }

    const selected = textarea.value.slice(start, end);
    if (/\s/.test(selected)) {
      alert("Please highlight a single word (no spaces).");
      // keep the same selection but refocus
      textarea.focus();
      textarea.setSelectionRange(start, end);
      return;
    }

    const res = await window.electronAPI.autocorrectText(selected);
    if (!res) return;

    const { original, corrected, changed } = res;

    // Replace the selection
    textarea.setRangeText(corrected, start, end, "end");

    // Put caret right after the corrected word and refocus textarea
    const newCaretPos = start + corrected.length;
    textarea.focus();
    textarea.setSelectionRange(newCaretPos, newCaretPos);

    const now = performance.now();
    const timestampMs =
      state.phaseStartTime != null
        ? Math.round(now - state.phaseStartTime)
        : 0;

    state.autocorrectEvents.push({
      participantId: state.participantId,
      phase: "baseline",
      timestampMs,
      originalWord: original,
      correctedWord: corrected,
      changed: changed ? 1 : 0
    });
  };
}

if (state.screen === "essay") {
  const btnEndEssay = document.getElementById("btnEndEssay");
  const btnEssayAutocorrect = document.getElementById("btnEssayAutocorrect");
  const textarea = document.getElementById("typingBox");

  if (state.currentPhase !== "essay") {
    state.currentPhase = "essay";
    state.phaseStartTime = performance.now();
    state.lastKeyTime = null;
  }

  attachTypingListeners(true);

  btnEndEssay.onclick = () => {
    endEssay();
  };

    btnEssayAutocorrect.onclick = async () => {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start == null || end == null || start === end) {
      alert("Please highlight a single word to autocorrect.");
      textarea.focus();
      const caret = textarea.value.length;
      textarea.setSelectionRange(caret, caret);
      return;
    }

    const selected = textarea.value.slice(start, end);
    if (/\s/.test(selected)) {
      alert("Please highlight a single word (no spaces).");
      textarea.focus();
      textarea.setSelectionRange(start, end);
      return;
    }

    const res = await window.electronAPI.autocorrectText(selected);
    if (!res) return;

    const { original, corrected, changed } = res;

    // Replace the selection
    textarea.setRangeText(corrected, start, end, "end");
    state.essayText = textarea.value;

    // Put caret right after the corrected word and refocus textarea
    const newCaretPos = start + corrected.length;
    textarea.focus();
    textarea.setSelectionRange(newCaretPos, newCaretPos);

    const now = performance.now();
    const timestampMs =
      state.phaseStartTime != null
        ? Math.round(now - state.phaseStartTime)
        : 0;

    state.autocorrectEvents.push({
      participantId: state.participantId,
      phase: "essay",
      timestampMs,
      originalWord: original,
      correctedWord: corrected,
      changed: changed ? 1 : 0
    });
  };
}

  if (state.screen === "phq9") {
    PHQ9_ITEMS.forEach((_, idx) => {
      const name = `phq9_item_${idx}`;
      const radios = Array.from(document.getElementsByName(name));
      radios.forEach((r) => {
        r.onchange = () => {
          const val = parseInt(r.value, 10);
          state.phq9.itemScores[idx] = val;
          const total = computePhqTotal();
          state.phq9.totalScore = total;
          setState({ phq9: state.phq9 });
        };
      });
    });

    const diffRadios = Array.from(
      document.getElementsByName("phq9_difficulty")
    );
    diffRadios.forEach((r) => {
      r.onchange = () => {
        state.phq9.difficulty = r.value;
        const total = computePhqTotal();
        state.phq9.totalScore = total;
        setState({ phq9: state.phq9 });
      };
    });

    document.getElementById("btnBackEssay").onclick = () => {
      setState({ screen: "essay" });
    };

    document.getElementById("btnPhq9Next").onclick = () => {
      const total = computePhqTotal();
      state.phq9.totalScore = total;
      setState({ phq9: state.phq9, screen: "gad7" });
    };
  }

  if (state.screen === "gad7") {
    GAD7_ITEMS.forEach((_, idx) => {
      const name = `gad7_item_${idx}`;
      const radios = Array.from(document.getElementsByName(name));
      radios.forEach((r) => {
        r.onchange = () => {
          const val = parseInt(r.value, 10);
          state.gad7.itemScores[idx] = val;
          const total = computeGadTotal();
          state.gad7.totalScore = total;
          setState({ gad7: state.gad7 });
        };
      });
    });

    const diffRadios = Array.from(
      document.getElementsByName("gad7_difficulty")
    );
    diffRadios.forEach((r) => {
      r.onchange = () => {
        state.gad7.difficulty = r.value;
        const total = computeGadTotal();
        state.gad7.totalScore = total;
        setState({ gad7: state.gad7 });
      };
    });

    document.getElementById("btnBackPhq9").onclick = () => {
      setState({ screen: "phq9" });
    };

    document.getElementById("btnGad7Next").onclick = () => {
      const total = computeGadTotal();
      state.gad7.totalScore = total;
      setState({ gad7: state.gad7, screen: "review" });
    };
  }

  if (state.screen === "review") {
    document.getElementById("btnExportAll").onclick = () => {
      handleExport();
    };
  }
}

// initial render
render();
