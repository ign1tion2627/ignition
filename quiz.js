// ============================================
// IGNITION — quiz engine
// Renders a quiz from QUIZ_DATA, scores it, and
// (if Supabase is configured) logs a completion row.
// ============================================

(function () {
  const container = document.getElementById("quiz-app");
  if (!container || typeof QUIZ_DATA === "undefined") return;

  const MODULE_ID = QUIZ_DATA.moduleId;
  const MODULE_TITLE = QUIZ_DATA.moduleTitle;
  const QUESTIONS = QUIZ_DATA.questions;

  let answers = new Array(QUESTIONS.length).fill(null);
  let submitted = false;

  function render() {
    container.innerHTML = `
      <div class="quiz-form-gate">
        <div class="field">
          <label for="q-name">First name</label>
          <input type="text" id="q-name" placeholder="e.g. Jordan" autocomplete="given-name" />
        </div>
        <div class="field">
          <label for="q-school">School (optional)</label>
          <input type="text" id="q-school" placeholder="e.g. Lincoln Middle School" autocomplete="organization" />
        </div>
      </div>
      <div id="q-list"></div>
      <button class="btn btn-primary" id="quiz-submit">Check my answers</button>
      <p class="quiz-status-msg" id="quiz-status"></p>
      <div class="quiz-result" id="quiz-result">
        <div class="score" id="quiz-score"></div>
        <p id="quiz-result-text"></p>
      </div>
    `;

    const list = document.getElementById("q-list");
    QUESTIONS.forEach((q, qi) => {
      const block = document.createElement("div");
      block.className = "q-block";
      block.innerHTML = `
        <div class="q-text">${qi + 1}. ${q.text}</div>
        <div class="q-options" role="radiogroup" aria-label="Question ${qi + 1}">
          ${q.options
            .map(
              (opt, oi) => `
            <label class="q-option" data-qi="${qi}" data-oi="${oi}">
              <input type="radio" name="q${qi}" value="${oi}" />
              <span>${opt}</span>
            </label>`
            )
            .join("")}
        </div>
        <div class="quiz-feedback" id="feedback-${qi}"></div>
      `;
      list.appendChild(block);
    });

    list.querySelectorAll(".q-option").forEach((el) => {
      el.addEventListener("click", () => {
        if (submitted) return;
        const qi = parseInt(el.dataset.qi, 10);
        const oi = parseInt(el.dataset.oi, 10);
        answers[qi] = oi;
        list
          .querySelectorAll(`.q-option[data-qi="${qi}"]`)
          .forEach((o) => o.classList.remove("selected"));
        el.classList.add("selected");
        el.querySelector("input").checked = true;
      });
    });

    document.getElementById("quiz-submit").addEventListener("click", handleSubmit);
  }

  async function handleSubmit() {
    const statusEl = document.getElementById("quiz-status");
    const nameEl = document.getElementById("q-name");
    const schoolEl = document.getElementById("q-school");

    if (!nameEl.value.trim()) {
      statusEl.textContent = "Add your first name so we can save your progress.";
      statusEl.classList.add("error");
      nameEl.focus();
      return;
    }
    if (answers.includes(null)) {
      statusEl.textContent = "Answer every question before checking.";
      statusEl.classList.add("error");
      return;
    }

    statusEl.classList.remove("error");
    statusEl.textContent = "";
    submitted = true;

    let correctCount = 0;
    QUESTIONS.forEach((q, qi) => {
      const options = document.querySelectorAll(`.q-option[data-qi="${qi}"]`);
      options.forEach((opt) => {
        const oi = parseInt(opt.dataset.oi, 10);
        if (oi === q.correct) opt.classList.add("correct");
        else if (oi === answers[qi]) opt.classList.add("incorrect");
      });
      const isRight = answers[qi] === q.correct;
      if (isRight) correctCount++;
      const fb = document.getElementById(`feedback-${qi}`);
      fb.textContent = isRight ? "Nice — that's right." : q.explain || "Not quite — check the highlighted answer.";
      fb.classList.add("show", isRight ? "correct" : "incorrect");
    });

    document.getElementById("quiz-submit").disabled = true;

    const resultBox = document.getElementById("quiz-result");
    const scoreEl = document.getElementById("quiz-score");
    const resultText = document.getElementById("quiz-result-text");
    scoreEl.textContent = `${correctCount} / ${QUESTIONS.length}`;
    resultText.textContent =
      correctCount === QUESTIONS.length
        ? "Perfect score. You've got this module down."
        : "Nice work finishing the module — feel free to revisit anything above.";
    resultBox.classList.add("show");

    await logCompletion(nameEl.value.trim(), schoolEl.value.trim(), correctCount);
  }

  async function logCompletion(name, school, score) {
    const statusEl = document.getElementById("quiz-status");
    const hasSupabase =
      typeof SUPABASE_URL !== "undefined" &&
      typeof SUPABASE_ANON_KEY !== "undefined" &&
      SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
      typeof supabase !== "undefined";

    if (!hasSupabase) {
      statusEl.textContent = "Progress saved locally on this device.";
      saveLocalFallback(name, school, score);
      return;
    }

    try {
      const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error } = await client.from("completions").insert([
        {
          module_id: MODULE_ID,
          module_title: MODULE_TITLE,
          student_name: name,
          school: school || null,
          score: score,
          total_questions: QUESTIONS.length,
        },
      ]);
      if (error) throw error;
      statusEl.textContent = "Saved! Your progress has been recorded.";
      markModuleDoneLocally();
    } catch (err) {
      console.error("Supabase insert failed:", err);
      statusEl.textContent = "Couldn't reach the server, but your score is shown above.";
      statusEl.classList.add("error");
      saveLocalFallback(name, school, score);
    }
  }

  function saveLocalFallback(name, school, score) {
    try {
      const key = "ignition_completions";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({
        module_id: MODULE_ID,
        module_title: MODULE_TITLE,
        student_name: name,
        school: school || null,
        score,
        total_questions: QUESTIONS.length,
        at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(existing));
      markModuleDoneLocally();
    } catch (e) {
      // localStorage unavailable — no-op
    }
  }

  function markModuleDoneLocally() {
    try {
      const key = "ignition_done_modules";
      const done = JSON.parse(localStorage.getItem(key) || "[]");
      if (!done.includes(MODULE_ID)) {
        done.push(MODULE_ID);
        localStorage.setItem(key, JSON.stringify(done));
      }
    } catch (e) {}
  }

  render();
})();
