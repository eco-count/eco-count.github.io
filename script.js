const STORAGE_KEY = "ecoCountHistoryV2";
const GOOGLE_CACHE_KEY = "ecoCountGoogleCacheV2";

// Replace this ONE URL after you deploy the Vercel backend.
// Example:
// const VERIFY_API_URL = "https://eco-count-api.vercel.app/api/verify";
const VERIFY_API_URL = "https://eco-count-api.vercel.app/api/verify";

const GOOGLE_CACHE_DAYS = 30;
const MODEL_NAME = "gemini-2.5-flash";

let knowledge = null;
let searchIndex = { confirmed: [], assumable: [], nonplastic: [] };
let history = loadHistory();
let knowledgeReady = null;

const els = {
  form: document.getElementById("checkForm"),
  input: document.getElementById("itemInput"),
  button: document.getElementById("checkButton"),
  countPill: document.getElementById("countPill"),
  result: document.getElementById("result"),
  expression: document.getElementById("expression"),
  resultLabel: document.getElementById("resultLabel"),
  resultTitle: document.getElementById("resultTitle"),
  resultSub: document.getElementById("resultSub"),
  resultText: document.getElementById("resultText"),
  resultGrid: document.getElementById("resultGrid"),
  resultMaterial: document.getElementById("resultMaterial"),
  resultWhy: document.getElementById("resultWhy"),
  resultSource: document.getElementById("resultSource"),
  sourcesBox: document.getElementById("sourcesBox"),
  dismiss: document.getElementById("dismissButton"),
  history: document.getElementById("history"),
  clearHistory: document.getElementById("clearHistory")
};

function normalize(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function titleCase(value) {
  return String(value).replace(/\w\S*/g, word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function loadGoogleCache() {
  try {
    const value = JSON.parse(localStorage.getItem(GOOGLE_CACHE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveGoogleCache(cache) {
  localStorage.setItem(GOOGLE_CACHE_KEY, JSON.stringify(cache));
}

function getCachedVerification(raw) {
  const cache = loadGoogleCache();
  const key = normalize(raw);
  const item = cache[key];

  if (!item) return null;

  const age = Date.now() - Number(item.timestamp || 0);
  const maxAge = GOOGLE_CACHE_DAYS * 24 * 60 * 60 * 1000;

  if (!Number.isFinite(age) || age < 0 || age > maxAge) {
    delete cache[key];
    saveGoogleCache(cache);
    return null;
  }

  return item.result || null;
}

function cacheVerification(raw, result) {
  const cache = loadGoogleCache();
  cache[normalize(raw)] = {
    timestamp: Date.now(),
    result
  };

  // Keep the cache bounded.
  const keys = Object.keys(cache);
  if (keys.length > 250) {
    keys
      .sort((a, b) => Number(cache[a].timestamp || 0) - Number(cache[b].timestamp || 0))
      .slice(0, keys.length - 250)
      .forEach(key => delete cache[key]);
  }

  saveGoogleCache(cache);
}

function isBackendConfigured() {
  return VERIFY_API_URL &&
    !VERIFY_API_URL.includes("YOUR-VERCEL-PROJECT.vercel.app");
}

async function loadKnowledge() {
  try {
    const response = await fetch("plastic.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`plastic.json returned ${response.status}`);
    knowledge = await response.json();
    searchIndex = buildSearchIndex();
  } catch (error) {
    console.error(error);
    knowledge = null;
    searchIndex = { confirmed: [], assumable: [], nonplastic: [] };
  }
}

function buildSearchIndex() {
  if (!knowledge) return { confirmed: [], assumable: [], nonplastic: [] };

  const make = list => list.flatMap(entry => [
    { entry, text: normalize(entry.item) },
    ...(entry.aliases || []).map(alias => ({
      entry,
      text: normalize(alias)
    }))
  ]);

  return {
    confirmed: make(knowledge.confirmed_plastic || []),
    assumable: make(knowledge.assumeable_plastic || []),
    nonplastic: make(knowledge.cannot_be_plastic || [])
  };
}

function localMatch(raw) {
  const text = normalize(raw);
  if (!text) return { type: "empty" };

  const groups = [
    ["confirmed", searchIndex.confirmed],
    ["nonplastic", searchIndex.nonplastic],
    ["assumable", searchIndex.assumable]
  ];

  // Exact matches first.
  for (const [groupName, group] of groups) {
    const exact = group
      .filter(x => x.text === text)
      .sort((a, b) => b.text.length - a.text.length)[0];

    if (exact) {
      return {
        type: groupName === "nonplastic" ? "nonplastic"
             : groupName === "assumable" ? "assumable"
             : "confirmed",
        entry: exact.entry
      };
    }
  }

  // Then phrase containment, longest match first.
  for (const [groupName, group] of groups) {
    const found = group
      .filter(x => x.text && text.includes(x.text))
      .sort((a, b) => b.text.length - a.text.length)[0];

    if (found) {
      return {
        type: groupName === "nonplastic" ? "nonplastic"
             : groupName === "assumable" ? "assumable"
             : "confirmed",
        entry: found.entry
      };
    }
  }

  return null;
}

function historyItem(raw, result) {
  return {
    id: Date.now() + Math.random(),
    item: raw.trim(),
    status: result.status,
    type: result.type || "",
    code: result.code ?? null,
    source: result.source || "",
    timestamp: new Date().toISOString()
  };
}

function addPlasticToHistory(raw, result) {
  history.unshift(historyItem(raw, result));
  saveHistory();
  renderHistory();
}

function updateCount() {
  els.countPill.textContent = `Total plastic count: ${history.length}`;
}

function renderHistory() {
  updateCount();

  if (!history.length) {
    els.history.innerHTML =
      '<div class="history-empty">No plastic items recorded yet.</div>';
    return;
  }

  const groups = {};

  history.forEach(entry => {
    const date = new Date(entry.timestamp);
    const key = date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    (groups[key] ||= []).push(entry);
  });

  els.history.innerHTML = Object.entries(groups).map(([day, entries]) => `
    <div class="day">
      <div class="day-label">${escapeHtml(day)}</div>
      ${entries.map(entry => {
        const date = new Date(entry.timestamp);
        const time = date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit"
        });

        const detail = entry.code
          ? `${escapeHtml(entry.type)} · Code #${escapeHtml(entry.code)}`
          : escapeHtml(entry.type || "Plastic type not identified");

        const badge = entry.status === "Likely plastic"
          ? '<span class="badge">Google</span>'
          : "";

        return `
          <div class="history-item">
            <div>
              <div class="history-name">
                ${escapeHtml(titleCase(entry.item))}${badge}
              </div>
              <div class="history-detail">${detail}</div>
            </div>
            <div class="history-time">${escapeHtml(time)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `).join("");
}

function showBaseResult({
  expression,
  label,
  title,
  sub,
  text,
  material = "",
  why = "",
  source = "",
  sourceLinks = [],
  grid = true
}) {
  els.result.classList.add("active");
  els.expression.textContent = expression;
  els.resultLabel.textContent = label;
  els.resultTitle.textContent = title;
  els.resultSub.textContent = sub;
  els.resultText.textContent = text;
  els.resultGrid.style.display = grid ? "grid" : "none";
  els.resultMaterial.textContent = material;
  els.resultWhy.textContent = why;
  els.resultSource.textContent = source;

  els.sourcesBox.innerHTML = sourceLinks.length
    ? sourceLinks.map(link =>
        `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>`
      ).join("")
    : "";
}

function displayConfirmed(raw, match) {
  const e = match.entry;
  const result = {
    status: "Plastic",
    type: e.type,
    code: e.code,
    source: "Local knowledge base"
  };

  showBaseResult({
    expression: "😞",
    label: "Plastic",
    title: titleCase(raw),
    sub: `${e.type} · Code #${e.code}`,
    text: `"${raw}" is in Eco Count's plastic knowledge base, so it has been recorded.`,
    material: e.type,
    why: e.note || "Known/common plastic item.",
    source: "plastic.json"
  });

  addPlasticToHistory(raw, result);
}

function displayAssumable(raw, match) {
  const e = match.entry;

  const result = {
    status: "Likely plastic",
    type: "Plastic — type not identified",
    code: null,
    source: "Local knowledge base"
  };

  showBaseResult({
    expression: "😞",
    label: "Likely plastic",
    title: titleCase(raw),
    sub: "Can reasonably be made from plastic",
    text: `"${raw}" can reasonably be made from plastic, so Eco Count treats this use as plastic and adds it to your count.`,
    material: "Plastic · exact resin unknown",
    why: e.reason,
    source: "plastic.json"
  });

  addPlasticToHistory(raw, result);
}

function displayNonPlastic(raw, match) {
  const e = match.entry;

  showBaseResult({
    expression: "😊",
    label: "Not a plastic",
    title: titleCase(raw),
    sub: "Your plastic count stays the same",
    text: `I don't think "${raw}" is a plastic item.`,
    material: "Non-plastic",
    why: e.reason || "Clearly non-plastic as described.",
    source: "plastic.json"
  });
}

function displayUnclear(
  raw,
  message = "I don't have enough reliable information to classify this item."
) {
  showBaseResult({
    expression: "🤔",
    label: "Can't determine",
    title: "I need more information",
    sub: "Nothing was added to your history",
    text: `${message} Please provide more detail, such as what the item is made from or what kind of item it is.`,
    material: "Unknown",
    why: "The local database did not contain a reliable match and Google did not provide a clear yes/no.",
    source: "Local data + Google verification",
    grid: false
  });
}

function displayUnavailable(raw, message) {
  showBaseResult({
    expression: "🤔",
    label: "Can't determine",
    title: "Google verification is unavailable",
    sub: "Nothing was added to your history",
    text: `${message} Try again later, or describe the material or item more specifically.`,
    material: "Unknown",
    why: "The local database did not contain a reliable match and the Google fallback was unavailable.",
    source: "Local data"
  });
}

async function googleVerify(raw) {
  const cached = getCachedVerification(raw);

  if (cached) {
    applyGoogleResult(raw, cached);
    return;
  }

  if (!isBackendConfigured()) {
    displayUnavailable(
      raw,
      "The Google verification backend has not been connected to this website yet."
    );
    return;
  }

  els.button.disabled = true;
  els.button.textContent = "Checking Google…";

  try {
    const response = await fetch(VERIFY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ item: raw })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          payload?.error ||
          "Google's free verification limit is temporarily unavailable."
        );
      }

      if (response.status === 503) {
        throw new Error(
          payload?.error ||
          "Google verification is temporarily unavailable."
        );
      }

      throw new Error(
        payload?.error ||
        `Verification backend returned HTTP ${response.status}.`
      );
    }

    if (!payload || !["YES", "NO", "UNCLEAR"].includes(payload.verdict)) {
      throw new Error("The verification backend returned an invalid classification.");
    }

    cacheVerification(raw, payload);
    applyGoogleResult(raw, payload);
  } catch (error) {
    console.error(error);
    displayUnavailable(raw, error.message || "Google verification could not return a reliable result.");
  } finally {
    els.button.disabled = false;
    els.button.textContent = "Check item";
  }
}

function applyGoogleResult(raw, result) {
  const sources = Array.isArray(result.sources)
    ? result.sources.filter(source => source?.url).slice(0, 5)
    : [];

  if (result.verdict === "YES") {
    const outcome = {
      status: "Likely plastic",
      type: "Plastic — web verified",
      code: null,
      source: "Google Search"
    };

    showBaseResult({
      expression: "😞",
      label: "Likely plastic",
      title: titleCase(raw),
      sub: "Google Search says it can be plastic",
      text: `Google's web-grounded result supports treating "${raw}" as plastic. It has been added to your Eco Count history.`,
      material: "Plastic · exact resin not established",
      why: result.reason || "Web evidence supports that the item can be plastic.",
      source: "Google Search",
      sourceLinks: sources
    });

    addPlasticToHistory(raw, outcome);
    return;
  }

  if (result.verdict === "NO") {
    showBaseResult({
      expression: "😊",
      label: "Not a plastic",
      title: titleCase(raw),
      sub: "Google Search says it is not plastic",
      text: `Google's web-grounded result does not support "${raw}" being plastic.`,
      material: "Non-plastic",
      why: result.reason || "Web evidence does not support plastic construction.",
      source: "Google Search",
      sourceLinks: sources
    });
    return;
  }

  displayUnclear(
    raw,
    result.reason || "Google did not provide a clear yes/no answer."
  );

  if (sources.length) {
    els.resultText.textContent += " You can also open the search sources shown below.";
    els.sourcesBox.innerHTML = sources.map(link =>
      `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>`
    ).join("");
  }
}

async function classify(raw) {
  const match = localMatch(raw);

  if (match?.type === "confirmed") {
    displayConfirmed(raw, match);
    return;
  }

  if (match?.type === "nonplastic") {
    displayNonPlastic(raw, match);
    return;
  }

  if (match?.type === "assumable") {
    displayAssumable(raw, match);
    return;
  }

  await googleVerify(raw);
}

els.form.addEventListener("submit", async event => {
  event.preventDefault();

  const raw = els.input.value.trim();

  if (!raw) {
    showBaseResult({
      expression: "👀",
      label: "Tell me what you used",
      title: "Nothing entered yet",
      sub: "Type an item in the box above",
      text: "Try something like “water bottle”, “cup”, or “banana skin”.",
      grid: false
    });
    return;
  }

  try {
    if (knowledgeReady) await knowledgeReady;
    await classify(raw);
  } catch (error) {
    console.error(error);
    displayUnavailable(raw, "Eco Count could not load its local knowledge base.");
  }
});

els.dismiss.addEventListener("click", () => {
  els.result.classList.remove("active");
  els.input.focus();
});

els.clearHistory.addEventListener("click", () => {
  if (!history.length) return;

  const confirmed = window.confirm(
    "Clear your entire plastic history and reset the count?"
  );

  if (!confirmed) return;

  history = [];
  saveHistory();
  renderHistory();
  els.result.classList.remove("active");
});

renderHistory();
knowledgeReady = loadKnowledge();

window.ecoCountConfig = {
  model: MODEL_NAME,
  backendConfigured: isBackendConfigured()
};
