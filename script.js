
const STORAGE_KEY = "ecoCountHistoryV2";
const GEMINI_CACHE_KEY = "ecoCountGeminiCacheV3";
const ADVICE_CACHE_KEY = "ecoCountAdviceCacheV1";

const VERIFY_API_URL =
  "https://eco-count-api.vercel.app/api/verify";

const GEMINI_CACHE_DAYS = 30;
const MODEL_NAME = "gemini-2.5-flash";

let knowledge = null;
let searchIndex = {
  confirmed: [],
  assumable: [],
  nonplastic: []
};

let history = loadHistory();
let knowledgeReady = null;
let activeResultToken = 0;

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

  actionsBox: document.getElementById("actionsBox"),
  reduceAction: document.getElementById("reduceAction"),
  reuseAction: document.getElementById("reuseAction"),
  recycleAction: document.getElementById("recycleAction"),

  dismiss: document.getElementById("dismissButton"),
  history: document.getElementById("history"),
  clearHistory: document.getElementById("clearHistory")
};


// --------------------------------------------------
// BASIC HELPERS
// --------------------------------------------------

function normalize(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function titleCase(value) {
  return String(value).replace(/\w\S*/g, word =>
    word.charAt(0).toUpperCase() +
    word.slice(1).toLowerCase()
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


// --------------------------------------------------
// HISTORY
// --------------------------------------------------

function loadHistory() {
  try {
    const value = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(history)
  );
}


// --------------------------------------------------
// GEMINI CLASSIFICATION CACHE
// --------------------------------------------------

function loadGeminiCache() {
  try {
    const value = JSON.parse(
      localStorage.getItem(GEMINI_CACHE_KEY) || "{}"
    );

    return value && typeof value === "object"
      ? value
      : {};
  } catch {
    return {};
  }
}

function saveGeminiCache(cache) {
  localStorage.setItem(
    GEMINI_CACHE_KEY,
    JSON.stringify(cache)
  );
}

function getCachedVerification(raw) {
  const cache = loadGeminiCache();
  const key = normalize(raw);
  const item = cache[key];

  if (!item) return null;

  const age =
    Date.now() -
    Number(item.timestamp || 0);

  const maxAge =
    GEMINI_CACHE_DAYS *
    24 *
    60 *
    60 *
    1000;

  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > maxAge
  ) {
    delete cache[key];
    saveGeminiCache(cache);
    return null;
  }

  return item.result || null;
}

function cacheVerification(raw, result) {
  const cache = loadGeminiCache();

  cache[normalize(raw)] = {
    timestamp: Date.now(),
    result
  };

  const keys = Object.keys(cache);

  if (keys.length > 250) {
    keys
      .sort(
        (a, b) =>
          Number(cache[a].timestamp || 0) -
          Number(cache[b].timestamp || 0)
      )
      .slice(0, keys.length - 250)
      .forEach(key => delete cache[key]);
  }

  saveGeminiCache(cache);
}


// --------------------------------------------------
// GEMINI ADVICE CACHE
// --------------------------------------------------

function loadAdviceCache() {
  try {
    const value = JSON.parse(
      localStorage.getItem(ADVICE_CACHE_KEY) || "{}"
    );

    return value && typeof value === "object"
      ? value
      : {};
  } catch {
    return {};
  }
}

function saveAdviceCache(cache) {
  localStorage.setItem(
    ADVICE_CACHE_KEY,
    JSON.stringify(cache)
  );
}

function getAdviceCacheKey(raw, type, code) {
  return [
    normalize(raw),
    normalize(type || ""),
    String(code ?? "")
  ].join("|");
}

function getCachedAdvice(raw, type, code) {
  const cache = loadAdviceCache();

  const key =
    getAdviceCacheKey(
      raw,
      type,
      code
    );

  const item = cache[key];

  if (!item) return null;

  const age =
    Date.now() -
    Number(item.timestamp || 0);

  const maxAge =
    GEMINI_CACHE_DAYS *
    24 *
    60 *
    60 *
    1000;

  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > maxAge
  ) {
    delete cache[key];
    saveAdviceCache(cache);
    return null;
  }

  return item.actions || null;
}

function cacheAdvice(
  raw,
  type,
  code,
  actions
) {
  const cache = loadAdviceCache();

  cache[
    getAdviceCacheKey(
      raw,
      type,
      code
    )
  ] = {
    timestamp: Date.now(),
    actions
  };

  const keys = Object.keys(cache);

  if (keys.length > 250) {
    keys
      .sort(
        (a, b) =>
          Number(cache[a].timestamp || 0) -
          Number(cache[b].timestamp || 0)
      )
      .slice(0, keys.length - 250)
      .forEach(key => delete cache[key]);
  }

  saveAdviceCache(cache);
}


// --------------------------------------------------
// ACTIONS UI
// --------------------------------------------------

function hideActions() {
  if (!els.actionsBox) return;

  els.actionsBox.hidden = true;

  els.actionsBox.classList.remove(
    "actions-loading"
  );

  if (els.reduceAction)
    els.reduceAction.textContent = "";

  if (els.reuseAction)
    els.reuseAction.textContent = "";

  if (els.recycleAction)
    els.recycleAction.textContent = "";
}

function showActionLoading() {
  if (!els.actionsBox) return;

  els.actionsBox.hidden = false;

  els.actionsBox.classList.add(
    "actions-loading"
  );

  els.reduceAction.textContent =
    "Generating a practical way to use less of this plastic…";

  els.reuseAction.textContent =
    "Finding a safe way to use it again…";

  els.recycleAction.textContent =
    "Working out the best recycling guidance…";
}

function showActions(actions, token) {
  if (
    !els.actionsBox ||
    token !== activeResultToken
  ) {
    return;
  }

  const reduce =
    String(actions?.reduce || "").trim();

  const reuse =
    String(actions?.reuse || "").trim();

  const recycle =
    String(actions?.recycle || "").trim();

  if (!reduce && !reuse && !recycle) {
    hideActions();
    return;
  }

  els.actionsBox.hidden = false;

  els.actionsBox.classList.remove(
    "actions-loading"
  );

  els.reduceAction.textContent =
    reduce ||
    "No specific reduction tip was returned.";

  els.reuseAction.textContent =
    reuse ||
    "No specific reuse tip was returned.";

  els.recycleAction.textContent =
    recycle ||
    "Check your local recycling rules for this item.";
}


// --------------------------------------------------
// GEMINI ADVICE REQUEST
// --------------------------------------------------

async function fetchAdvice(
  raw,
  type,
  code,
  token
) {
  const cached =
    getCachedAdvice(
      raw,
      type,
      code
    );

  if (cached) {
    showActions(cached, token);
    return;
  }

  if (!isBackendConfigured()) {
    return;
  }

  showActionLoading();

  try {
    const response = await fetch(
      VERIFY_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          mode: "advice",
          item: raw,
          plasticType:
            type || "Plastic",
          code: code ?? null
        })
      }
    );

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        payload?.error ||
        `Advice backend returned HTTP ${response.status}.`
      );
    }

    const actions =
      payload?.actions;

    if (
      !actions ||
      typeof actions !== "object"
    ) {
      throw new Error(
        "Gemini returned no usable recycling advice."
      );
    }

    const clean = {
      reduce:
        String(actions.reduce || "").trim(),

      reuse:
        String(actions.reuse || "").trim(),

      recycle:
        String(actions.recycle || "").trim()
    };

    cacheAdvice(
      raw,
      type,
      code,
      clean
    );

    showActions(
      clean,
      token
    );

  } catch (error) {
    console.error(
      "Advice error:",
      error
    );

    if (
      token === activeResultToken
    ) {
      hideActions();
    }
  }
}


// --------------------------------------------------
// BACKEND CHECK
// --------------------------------------------------

function isBackendConfigured() {
  return (
    VERIFY_API_URL &&
    !VERIFY_API_URL.includes(
      "YOUR-VERCEL-PROJECT.vercel.app"
    )
  );
}


// --------------------------------------------------
// LOCAL KNOWLEDGE BASE
// --------------------------------------------------

async function loadKnowledge() {
  try {
    const response =
      await fetch(
        "plastic.json",
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `plastic.json returned ${response.status}`
      );
    }

    knowledge =
      await response.json();

    searchIndex =
      buildSearchIndex();

  } catch (error) {
    console.error(error);

    knowledge = null;

    searchIndex = {
      confirmed: [],
      assumable: [],
      nonplastic: []
    };
  }
}

function buildSearchIndex() {
  if (!knowledge) {
    return {
      confirmed: [],
      assumable: [],
      nonplastic: []
    };
  }

  const make = list =>
    list.flatMap(entry => [
      {
        entry,
        text: normalize(entry.item)
      },

      ...(entry.aliases || []).map(
        alias => ({
          entry,
          text: normalize(alias)
        })
      )
    ]);

  return {
    confirmed:
      make(
        knowledge.confirmed_plastic || []
      ),

    assumable:
      make(
        knowledge.assumeable_plastic || []
      ),

    nonplastic:
      make(
        knowledge.cannot_be_plastic || []
      )
  };
}

function localMatch(raw) {
  const text = normalize(raw);

  if (!text) {
    return {
      type: "empty"
    };
  }

  const groups = [
    [
      "confirmed",
      searchIndex.confirmed
    ],

    [
      "nonplastic",
      searchIndex.nonplastic
    ],

    [
      "assumable",
      searchIndex.assumable
    ]
  ];

  // Exact matches first.
  for (
    const [groupName, group]
    of groups
  ) {
    const exact =
      group
        .filter(
          x => x.text === text
        )
        .sort(
          (a, b) =>
            b.text.length -
            a.text.length
        )[0];

    if (exact) {
      return {
        type:
          groupName === "nonplastic"
            ? "nonplastic"
            : groupName === "assumable"
              ? "assumable"
              : "confirmed",

        entry: exact.entry
      };
    }
  }

  // Phrase containment.
  for (
    const [groupName, group]
    of groups
  ) {
    const found =
      group
        .filter(
          x =>
            x.text &&
            text.includes(x.text)
        )
        .sort(
          (a, b) =>
            b.text.length -
            a.text.length
        )[0];

    if (found) {
      return {
        type:
          groupName === "nonplastic"
            ? "nonplastic"
            : groupName === "assumable"
              ? "assumable"
              : "confirmed",

        entry: found.entry
      };
    }
  }

  return null;
}


// --------------------------------------------------
// HISTORY DISPLAY
// --------------------------------------------------

function historyItem(
  raw,
  result
) {
  return {
    id:
      Date.now() +
      Math.random(),

    item:
      raw.trim(),

    status:
      result.status,

    type:
      result.type || "",

    code:
      result.code ?? null,

    source:
      result.source || "",

    timestamp:
      new Date().toISOString()
  };
}

function addPlasticToHistory(
  raw,
  result
) {
  history.unshift(
    historyItem(
      raw,
      result
    )
  );

  saveHistory();
  renderHistory();
}

function updateCount() {
  els.countPill.textContent =
    `Total plastic count: ${history.length}`;
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
    const date =
      new Date(
        entry.timestamp
      );

    const key =
      date.toLocaleDateString(
        undefined,
        {
          year: "numeric",
          month: "long",
          day: "numeric"
        }
      );

    (
      groups[key] ||=
      []
    ).push(entry);
  });

  els.history.innerHTML =
    Object.entries(groups)
      .map(
        ([day, entries]) => `
        <div class="day">

          <div class="day-label">
            ${escapeHtml(day)}
          </div>

          ${entries
            .map(entry => {
              const date =
                new Date(
                  entry.timestamp
                );

              const time =
                date.toLocaleTimeString(
                  undefined,
                  {
                    hour: "numeric",
                    minute: "2-digit"
                  }
                );

              const detail =
                entry.code
                  ? `${escapeHtml(entry.type)} · Code #${escapeHtml(entry.code)}`
                  : escapeHtml(
                      entry.type ||
                      "Plastic type not identified"
                    );

              const badge =
                entry.status ===
                "Likely plastic"
                  ? '<span class="badge">AI</span>'
                  : "";

              return `
                <div class="history-item">

                  <div>
                    <div class="history-name">
                      ${escapeHtml(
                        titleCase(
                          entry.item
                        )
                      )}
                      ${badge}
                    </div>

                    <div class="history-detail">
                      ${detail}
                    </div>
                  </div>

                  <div class="history-time">
                    ${escapeHtml(time)}
                  </div>

                </div>
              `;
            })
            .join("")}

        </div>
      `
      )
      .join("");
}


// --------------------------------------------------
// RESULT DISPLAY
// --------------------------------------------------

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
  hideActions();

  els.result.classList.add(
    "active"
  );

  els.expression.textContent =
    expression;

  els.resultLabel.textContent =
    label;

  els.resultTitle.textContent =
    title;

  els.resultSub.textContent =
    sub;

  els.resultText.textContent =
    text;

  els.resultGrid.style.display =
    grid ? "grid" : "none";

  els.resultMaterial.textContent =
    material;

  els.resultWhy.textContent =
    why;

  els.resultSource.textContent =
    source;

  els.sourcesBox.innerHTML =
    sourceLinks.length
      ? sourceLinks
          .map(
            link =>
              `<a href="${escapeHtml(
                link.url
              )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                link.title
              )}</a>`
          )
          .join("")
      : "";
}


// --------------------------------------------------
// LOCAL RESULTS
// --------------------------------------------------

function displayConfirmed(
  raw,
  match,
  token
) {
  const e =
    match.entry;

  const result = {
    status: "Plastic",
    type: e.type,
    code: e.code,
    source:
      "Local knowledge base"
  };

  showBaseResult({
    expression: "😞",

    label: "Plastic",

    title:
      titleCase(raw),

    sub:
      `${e.type} · Code #${e.code}`,

    text:
      `"${raw}" is in Eco Count's plastic knowledge base, so it has been recorded.`,

    material:
      e.type,

    why:
      e.note ||
      "Known/common plastic item.",

    source:
      "plastic.json"
  });

  addPlasticToHistory(
    raw,
    result
  );

  // NEW:
  // Ask Gemini for Reduce / Reuse / Recycle.
  fetchAdvice(
    raw,
    e.type,
    e.code,
    token
  );
}

function displayAssumable(
  raw,
  match,
  token
) {
  const e =
    match.entry;

  const result = {
    status:
      "Likely plastic",

    type:
      "Plastic — type not identified",

    code:
      null,

    source:
      "Local knowledge base"
  };

  showBaseResult({
    expression: "😞",

    label:
      "Likely plastic",

    title:
      titleCase(raw),

    sub:
      "Can reasonably be made from plastic",

    text:
      `"${raw}" can reasonably be made from plastic, so Eco Count treats this use as plastic and adds it to your count.`,

    material:
      "Plastic · exact resin unknown",

    why:
      e.reason,

    source:
      "plastic.json"
  });

  addPlasticToHistory(
    raw,
    result
  );

  // NEW:
  // Ask Gemini for Reduce / Reuse / Recycle.
  fetchAdvice(
    raw,
    result.type,
    result.code,
    token
  );
}

function displayNonPlastic(
  raw,
  match
) {
  const e =
    match.entry;

  showBaseResult({
    expression: "😊",

    label:
      "Not a plastic",

    title:
      titleCase(raw),

    sub:
      "Your plastic count stays the same",

    text:
      `I don't think "${raw}" is a plastic item.`,

    material:
      "Non-plastic",

    why:
      e.reason ||
      "Clearly non-plastic as described.",

    source:
      "plastic.json"
  });
}

function displayUnclear(
  raw,
  message =
    "I don't have enough reliable information to classify this item."
) {
  showBaseResult({
    expression: "🤔",

    label:
      "Can't determine",

    title:
      "I need more information",

    sub:
      "Nothing was added to your history",

    text:
      `${message} Please provide more detail, such as what the item is made from or what kind of item it is.`,

    material:
      "Unknown",

    why:
      "The local database did not contain a reliable match and Gemini did not provide a clear yes/no.",

    source:
      "Local data + Gemini AI",

    grid: false
  });
}

function displayUnavailable(
  raw,
  message
) {
  showBaseResult({
    expression: "🤔",

    label:
      "Can't determine",

    title:
      "Gemini verification is unavailable",

    sub:
      "Nothing was added to your history",

    text:
      `${message} Try again later, or describe the material or item more specifically.`,

    material:
      "Unknown",

    why:
      "The local database did not contain a reliable match and the Gemini fallback was unavailable.",

    source:
      "Local data"
  });
}


// --------------------------------------------------
// GEMINI CLASSIFICATION
// --------------------------------------------------

async function geminiVerify(
  raw,
  token
) {
  const cached =
    getCachedVerification(
      raw
    );

  if (cached) {
    applyGeminiResult(
      raw,
      cached,
      token
    );

    return;
  }

  if (
    !isBackendConfigured()
  ) {
    displayUnavailable(
      raw,
      "The Gemini verification backend has not been connected to this website yet."
    );

    return;
  }

  els.button.disabled = true;

  els.button.textContent =
    "Checking AI…";

  try {
    const response =
      await fetch(
        VERIFY_API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          // IMPORTANT:
          // This remains the original
          // classification request.
          body: JSON.stringify({
            item: raw
          })
        }
      );

    let payload = null;

    try {
      payload =
        await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (
        response.status ===
        429
      ) {
        throw new Error(
          payload?.error ||
          "Gemini's free verification limit is temporarily unavailable."
        );
      }

      if (
        response.status ===
        503
      ) {
        throw new Error(
          payload?.error ||
          "Gemini verification is temporarily unavailable."
        );
      }

      throw new Error(
        payload?.error ||
        `Verification backend returned HTTP ${response.status}.`
      );
    }

    if (
      !payload ||
      ![
        "YES",
        "NO",
        "UNCLEAR"
      ].includes(
        payload.verdict
      )
    ) {
      throw new Error(
        "The verification backend returned an invalid classification."
      );
    }

    cacheVerification(
      raw,
      payload
    );

    applyGeminiResult(
      raw,
      payload,
      token
    );

  } catch (error) {
    console.error(error);

    displayUnavailable(
      raw,
      error.message ||
      "Gemini verification could not return a reliable result."
    );

  } finally {
    els.button.disabled =
      false;

    els.button.textContent =
      "Check item";
  }
}


// --------------------------------------------------
// APPLY GEMINI RESULT
// --------------------------------------------------

function applyGeminiResult(
  raw,
  result,
  token
) {
  const sources =
    Array.isArray(
      result.sources
    )
      ? result.sources
          .filter(
            source =>
              source?.url
          )
          .slice(0, 5)
      : [];

  if (
    result.verdict ===
    "YES"
  ) {
    const outcome = {
      status:
        "Likely plastic",

      type:
        "Plastic — web verified",

      code:
        null,

      source:
        "Gemini AI"
    };

    showBaseResult({
      expression: "😞",

      label:
        "Likely plastic",

      title:
        titleCase(raw),

      sub:
        "Gemini says it can be plastic",

      text:
        `Gemini's classification supports treating "${raw}" as plastic. It has been added to your Eco Count history.`,

      material:
        "Plastic · exact resin not established",

      why:
        result.reason ||
        "Gemini's general-knowledge classification supports treating the item as plastic.",

      source:
        "Gemini AI",

      sourceLinks:
        sources
    });

    addPlasticToHistory(
      raw,
      outcome
    );

    /*
     * If an older backend happens to return
     * actions together with the classification,
     * use them.
     *
     * Otherwise ask the new advice endpoint.
     */
    const hasActions =
      result.actions &&
      [
        result.actions.reduce,
        result.actions.reuse,
        result.actions.recycle
      ].some(
        value =>
          String(
            value || ""
          ).trim()
      );

    if (hasActions) {
      showActions(
        result.actions,
        token
      );
    } else {
      fetchAdvice(
        raw,
        outcome.type,
        outcome.code,
        token
      );
    }

    return;
  }

  if (
    result.verdict ===
    "NO"
  ) {
    showBaseResult({
      expression: "😊",

      label:
        "Not a plastic",

      title:
        titleCase(raw),

      sub:
        "Gemini says it is not plastic",

      text:
        `Gemini's classification does not support "${raw}" being plastic.`,

      material:
        "Non-plastic",

      why:
        result.reason ||
        "Gemini's general-knowledge classification does not support treating the item as plastic.",

      source:
        "Gemini AI",

      sourceLinks:
        sources
    });

    return;
  }

  displayUnclear(
    raw,
    result.reason ||
      "Gemini did not provide a clear yes/no answer."
  );

  if (sources.length) {
    els.resultText.textContent +=
      " You can also open the search sources shown below.";

    els.sourcesBox.innerHTML =
      sources
        .map(
          link =>
            `<a href="${escapeHtml(
              link.url
            )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              link.title
            )}</a>`
        )
        .join("");
  }
}


// --------------------------------------------------
// MAIN CLASSIFIER
// --------------------------------------------------

async function classify(
  raw,
  token
) {
  const match =
    localMatch(raw);

  if (
    match?.type ===
    "confirmed"
  ) {
    displayConfirmed(
      raw,
      match,
      token
    );

    return;
  }

  if (
    match?.type ===
    "nonplastic"
  ) {
    displayNonPlastic(
      raw,
      match
    );

    return;
  }

  if (
    match?.type ===
    "assumable"
  ) {
    displayAssumable(
      raw,
      match,
      token
    );

    return;
  }

  // Unknown item → original Gemini verification.
  await geminiVerify(
    raw,
    token
  );
}


// --------------------------------------------------
// EVENTS
// --------------------------------------------------

els.form.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const raw =
      els.input.value.trim();

    if (!raw) {
      showBaseResult({
        expression: "👀",

        label:
          "Tell me what you used",

        title:
          "Nothing entered yet",

        sub:
          "Type an item in the box above",

        text:
          'Try something like “water bottle”, “cup”, or “banana skin”.',

        grid: false
      });

      return;
    }

    const token =
      ++activeResultToken;

    try {
      if (
        knowledgeReady
      ) {
        await knowledgeReady;
      }

      await classify(
        raw,
        token
      );

    } catch (error) {
      console.error(error);

      displayUnavailable(
        raw,
        "Eco Count could not load its local knowledge base."
      );
    }
  }
);


els.dismiss.addEventListener(
  "click",
  () => {
    activeResultToken += 1;

    hideActions();

    els.result.classList.remove(
      "active"
    );

    els.input.focus();
  }
);


els.clearHistory.addEventListener(
  "click",
  () => {
    if (!history.length)
      return;

    const confirmed =
      window.confirm(
        "Clear your entire plastic history and reset the count?"
      );

    if (!confirmed)
      return;

    history = [];

    saveHistory();
    renderHistory();

    activeResultToken += 1;

    hideActions();

    els.result.classList.remove(
      "active"
    );
  }
);


// --------------------------------------------------
// INITIALIZE
// --------------------------------------------------

renderHistory();

knowledgeReady =
  loadKnowledge();

window.ecoCountConfig = {
  model: MODEL_NAME,
  backendConfigured:
    isBackendConfigured()
};
