
/*
 FIELDHOUSE / LAXR — CAREER UPDATE
 Replace the entire old updates.js with this file.
 Load AFTER the original game's inline script.
 Does not delete the existing career save.
*/

(() => {
  "use strict";

  if (
    typeof state === "undefined" ||
    typeof renderAll !== "function" ||
    typeof renderSeason !== "function" ||
    typeof resolveGame !== "function" ||
    typeof PROGRAMS === "undefined"
  ) {
    console.error("FIELDHOUSE: Original game not loaded.");
    return;
  }

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const random = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const nextGame = () =>
    state.season.schedule.find(g => !g.played);

  const update = () => {
    if (!state.careerV3) {
      state.careerV3 = {
        actions: 0,
        daysToGame: 3,
        opponentFilm: 0,
        gameChoices: [],
        games: 0,
        weeks: 0,
        september: false,
        lastOffer: -100,
        media: [],
        background: "standard",
        lastRankUpdate: 0
      };
    }
    return state.careerV3;
  };

  function notice(message) {
    if (typeof toast === "function") toast(message);
  }

  function activity(message) {
    if (typeof act === "function") act(message);
  }

  function headline(title, body, category = "NEWS") {
    const u = update();

    u.media.unshift({
      title,
      body,
      category,
      day: state.calendarDay || 1
    });

    u.media = u.media.slice(0, 50);
  }

  // =====================================
  // CALENDAR
  // =====================================

  const oldRenderSeason = renderSeason;

  renderSeason = function () {
    oldRenderSeason();

    if (!state.created || state.committed) return;

    const root = document.getElementById("season");
    if (!root) return;

    root.querySelector("#laxr-calendar")?.remove();

    const u = update();
    const g = nextGame();

    const title = g
      ? u.daysToGame === 0
        ? "GAME DAY — " + g.opponent
        : u.daysToGame + " days until " + g.opponent
      : "Season phase complete";

    const panel = document.createElement("div");

    panel.id = "laxr-calendar";
    panel.className = "panel";
    panel.style.marginBottom = "14px";

    panel.innerHTML = `
      <div class="tiny">
        CAREER CALENDAR · DAY ${state.calendarDay || 1}
      </div>

      <h2>${esc(title)}</h2>

      <p class="muted">
        Build your career between games.
        You have two activities each day.
      </p>

      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn" onclick="laxrActivity('practice')">
          Position practice
        </button>

        <button class="btn" onclick="laxrActivity('opponent')">
          Watch opponent film
        </button>

        <button class="btn" onclick="laxrActivity('self')">
          Review your film
        </button>

        <button class="btn ghost" onclick="laxrActivity('rest')">
          Recover
        </button>

        <button class="btn ghost" onclick="laxrActivity('recruit')">
          Recruiting work
        </button>

        <button class="btn lime" onclick="laxrNextDay()">
          Next day →
        </button>
      </div>

      <p class="muted">
        Activities: ${u.actions}/2 ·
        Opponent preparation: ${u.opponentFilm}/3 ·
        Fatigue: ${Math.round(state.training.fatigue || 0)}
      </p>
    `;

    const first = root.querySelector(".panel");

    if (first) first.before(panel);
    else root.prepend(panel);

    if (g && u.daysToGame > 0) {
      root.querySelectorAll(
        'button[onclick="playNextGame()"]'
      ).forEach(button => {
        button.disabled = true;
        button.textContent = "Game in " + u.daysToGame + " days";
      });
    }
  };

  window.laxrActivity = function (type) {
    if (!state.created || state.committed) return;

    const u = update();

    if (u.actions >= 2) {
      notice("You have used both activities today.");
      return;
    }

    const p = state.player;
    const attributes = p.stats || {};
    const training = state.training;

    u.actions++;

    if (type === "practice") {
      const choices = (ATTRS[p.position] || [])
        .filter(a => a !== "Lacrosse IQ");

      if (choices.length) {
        const attribute = pick(choices);

        attributes[attribute] = clamp(
          Math.round(
            ((Number(attributes[attribute]) || 60) +
              random(0.2, 0.5)) * 10
          ) / 10,
          0,
          99
        );

        activity("Practiced " + attribute + ".");
      }

      training.fatigue = clamp(
        (training.fatigue || 0) + 8, 0, 100
      );
    }

    if (type === "opponent") {
      u.opponentFilm = clamp(u.opponentFilm + 1, 0, 3);

      const g = nextGame();

      activity(
        "Studied film on " +
        (g ? g.opponent : "your next opponent") +
        "."
      );
    }

    if (type === "self") {
      attributes["Lacrosse IQ"] = clamp(
        (Number(attributes["Lacrosse IQ"]) || 60) + 0.3,
        0,
        99
      );

      p.iq = attributes["Lacrosse IQ"];

      activity("Reviewed personal film. Lacrosse IQ improved.");
    }

    if (type === "rest") {
      training.fatigue = clamp(
        (training.fatigue || 0) - 25, 0, 100
      );

      activity("Recovered between games.");
    }

    if (type === "recruit") {
      p.film = clamp((p.film || 0) + 0.8, 0, 100);
      p.exposure = clamp((p.exposure || 0) + 0.3, 0, 100);

      activity("Updated recruiting film and profile.");
    }

    save();
    renderAll();
    showView("season");
  };

  window.laxrNextDay = function () {
    if (!state.created || state.committed) return;

    const u = update();

    state.calendarDay = (state.calendarDay || 1) + 1;
    u.actions = 0;
    u.daysToGame = Math.max(0, u.daysToGame - 1);

    state.training.fatigue = clamp(
      (state.training.fatigue || 0) - 4, 0, 100
    );

    if (state.calendarDay % 7 === 0) {
      u.weeks++;
      weeklyRecruiting();
    }

    save();
    renderAll();
    showView("season");
  };

  // =====================================
  // RECRUITING
  // =====================================

  // Disable the original per-game offer explosion.
  recruitingTick = function () {};

  function septemberRush() {
    const u = update();

    if (u.september) return;

    u.september = true;

    const overall = avg();

    const target = overall >= 88 ? 12 :
                   overall >= 80 ? 10 :
                   overall >= 73 ? 6 : 2;

    const existing = new Set(
      state.threads
        .filter(t => t.kind === "coach")
        .map(t => t.schoolId)
    );

    const available = PROGRAMS
      .map((school, i) => ({
        school,
        i,
        pr: ensureProgram(i)
      }))
      .filter(x =>
        !existing.has(x.i) &&
        x.pr.committedRecruits < x.pr.need
      )
      .sort((a, b) =>
        b.pr.interest - a.pr.interest
      );

    available
      .slice(0, Math.max(0, target - existing.size))
      .forEach(x => {
        newThread(
          x.school[0] + " · Recruiting",
          "coach",
          x.i,
          pick([
            "September 1 is here. We've been following your film and want to talk.",
            "Our staff has you on the recruiting board. What's your fall schedule?",
            "We watched your summer performances and want to learn more about you.",
            "We've been evaluating your class and would love to start a conversation."
          ])
        );

        x.pr.lastContact = state.calendarDay;
      });

    headline(
      "September recruiting window opens",
      state.player.name +
      " is drawing attention from college lacrosse programs.",
      "RECRUITING"
    );

    activity("September 1: coaches began reaching out.");
  }

  automaticRecruitingSweep = function (isSeptember) {
    if (isSeptember) septemberRush();
  };

  function weeklyRecruiting() {
    const u = update();

    if (!u.september) return;
    if (Math.random() > 0.3) return;

    const existing = new Set(
      state.threads
        .filter(t => t.kind === "coach")
        .map(t => t.schoolId)
    );

    if (existing.size >= 18) return;

    const eligible = PROGRAMS
      .map((school, i) => ({
        school,
        i,
        pr: ensureProgram(i)
      }))
      .filter(x =>
        !existing.has(x.i) &&
        x.pr.interest >= 58 &&
        x.pr.committedRecruits < x.pr.need
      );

    if (!eligible.length) return;

    const x = pick(eligible);

    newThread(
      x.school[0] + " · Recruiting",
      "coach",
      x.i,
      pick([
        "We reviewed your recent film. How is your season going?",
        "Our staff is following your development. Keep us updated.",
        "We are evaluating your class and wanted to reconnect."
      ])
    );

    x.pr.lastContact = state.calendarDay;
  }

  offerSchool = function (i) {
    const u = update();
    const school = PROGRAMS[i];
    const pr = ensureProgram(i);

    if (!school || !u.september) return;
    if (pr.offer) return;
    if (pr.committedRecruits >= pr.need) return;
    if (u.weeks < 3) return;

    if ((state.calendarDay || 1) - u.lastOffer < 21) {
      return;
    }

    const threshold =
      school[1] === "D-I" ? 90 :
      school[1] === "D-II" ? 84 : 80;

    if (pr.interest < threshold) return;

    if (avg() < (school[1] === "D-I" ? 82 : 74)) {
      return;
    }

    const relationship = state.threads.some(t =>
      t.kind === "coach" && t.schoolId === i
    );

    if (!relationship) return;

    if (state.offers.some(o => o.school === school[0])) {
      return;
    }

    pr.offer = true;
    u.lastOffer = state.calendarDay;

    state.offers.push({
      school: school[0],
      division: school[1],
      day: state.calendarDay
    });

    newThread(
      school[0] + " · Recruiting",
      "coach",
      i,
      "Our staff has evaluated your film over several weeks. We'd like to extend an offer."
    );

    headline(
      school[0] + " offers " + state.player.name,
      "A major recruiting milestone after weeks of evaluation.",
      "OFFERS"
    );

    activity("COLLEGE OFFER: " + school[0]);

    save();
  };

  // =====================================
  // INTERACTIVE GAMES
  // =====================================

  const oldResolve = resolveGame;

  const offenseSituations = [
    {
      title: "Opening matchup",
      description: "Their defense is sliding aggressively.",
      choices: [
        "Attack your matchup",
        "Find the open teammate",
        "Reset the offense"
      ]
    },
    {
      title: "Halftime adjustment",
      description: "Their defensive coordinator has adjusted.",
      choices: [
        "Push transition",
        "Find the crease",
        "Run a patient possession"
      ]
    },
    {
      title: "Fourth-quarter pressure",
      description: "The next possession could decide the game.",
      choices: [
        "Go to goal",
        "Create for a teammate",
        "Protect possession"
      ]
    }
  ];

  const defenseSituations = [
    {
      title: "First defensive stand",
      description: "Their leading scorer attacks from the wing.",
      choices: [
        "Force the weak hand",
        "Call the early slide",
        "Hold your matchup"
      ]
    },
    {
      title: "Transition pressure",
      description: "The opponent pushes after a turnover.",
      choices: [
        "Pick up the ball",
        "Protect the crease",
        "Organize recovery"
      ]
    },
    {
      title: "Late-game stop",
      description: "A crucial possession is coming.",
      choices: [
        "Pressure the carrier",
        "Communicate the rotation",
        "Stay compact"
      ]
    }
  ];

  playNextGame = function () {
    if (!nextGame()) {
      notice("This phase is complete.");
      return;
    }

    if (update().daysToGame > 0) {
      showView("season");
      notice("Advance the calendar to game day.");
      return;
    }

    update().gameChoices = [];
    window.laxrGameChoice();
  };

  window.laxrGameChoice = function (choice) {
    const u = update();

    if (Number.isInteger(choice)) {
      u.gameChoices.push(choice);
    }

    const step = u.gameChoices.length;
    const g = nextGame();

    if (!g) return;

    if (step >= 3) {
      const last = u.gameChoices[2];

      const action =
        last === 0 ? "aggressive" :
        last === 1 ? "team" : "balanced";

      resolveGame(action);
      return;
    }

    const offense = ["Attack", "Midfield"]
      .includes(state.player.position);

    const situation = (
      offense ? offenseSituations : defenseSituations
    )[step];

    openModal(`
      <button class="close" onclick="closeModal()">
        Close
      </button>

      <div class="eyebrow">
        ${esc(g.opponent)} · DECISION ${step + 1} OF 3
      </div>

      <h2>${esc(situation.title)}</h2>
      <p class="muted">${esc(situation.description)}</p>

      <div class="row" style="flex-wrap:wrap;gap:8px">
        ${situation.choices.map((label, i) => `
          <button
            class="btn ${i === 0 ? "lime" : ""}"
            onclick="laxrGameChoice(${i})"
          >
            ${esc(label)}
          </button>
        `).join("")}
      </div>
    `);
  };

  resolveGame = function (action) {
    const u = update();
    const g = nextGame();

    if (!g) return;

    const previousGoals = state.season.goals || 0;
    const previousAssists = state.season.assists || 0;

    const preparation = u.opponentFilm * 4;

    state.training.fatigue = clamp(
      (state.training.fatigue || 0) - preparation,
      0,
      100
    );

    oldResolve(action);

    if (!g.played) return;

    const position = state.player.position;

    if (["Attack", "Midfield"].includes(position)) {
      const overall = avg();
      const elite = clamp((overall - 65) / 28, 0, 1);

      const points = Math.max(
        0,
        Math.round(
          random(0, 2.5) +
          elite * random(2, 5.5) +
          u.opponentFilm * 0.2
        )
      );

      const result = /^(\d+)-(\d+)$/.exec(g.result || "");

      const teamGoals = result
        ? Number(result[1])
        : Math.max(3, points);

      const actualPoints = Math.min(points, teamGoals);

      const assistShare = action === "team"
        ? random(0.5, 0.8)
        : random(0.2, 0.55);

      const assists = Math.round(
        actualPoints * assistShare
      );

      const goals = actualPoints - assists;

      state.season.goals =
        (state.season.goals || 0) -
        ((state.season.goals || 0) - previousGoals) +
        goals;

      state.season.assists =
        (state.season.assists || 0) -
        ((state.season.assists || 0) - previousAssists) +
        assists;

      g.line = `${goals} G · ${assists} A`;

      if (state.season.lastResult) {
        state.season.lastResult.goals = goals;
        state.season.lastResult.assists = assists;
      }

      if (actualPoints >= 5) {
        headline(
          state.player.name +
          " erupts for " + actualPoints + " points",
          `${goals} goals and ${assists} assists against ${g.opponent}.`,
          "GAME RECAP"
        );
      }
    }

    // Stop a playoff run after elimination.
    const playoff =
      (state.season.phase || "").includes("playoffs");

    const eliminated =
      g.outcome === "eliminated" ||
      (playoff && g.outcome === "loss");

    if (eliminated) {
      state.season.schedule
        .filter(x => !x.played)
        .forEach(x => {
          x.played = true;
          x.result = "Eliminated";
          x.outcome = "eliminated";
          x.line = "—";
        });
    }

    u.games++;

    u.daysToGame =
      u.games % 5 === 0
        ? 10
        : 5 + Math.floor(Math.random() * 3);

    u.actions = 0;
    u.opponentFilm = 0;
    u.gameChoices = [];

    save();
    renderAll();
  };

  // =====================================
  // MEDIA COVERAGE
  // =====================================

  if (typeof renderRankings === "function") {
    const oldRankings = renderRankings;

    renderRankings = function () {
      oldRankings();

      if (!state.created) return;

      const root = document.getElementById("rankings");

      if (!root) return;

      const u = update();

      const panel = document.createElement("div");

      panel.className = "panel";
      panel.style.marginTop = "14px";

      panel.innerHTML = `
        <div class="row" style="justify-content:space-between">
          <h2>The Crease Report</h2>
          <span class="badge">FICTIONAL MEDIA</span>
        </div>

        <p class="muted">
          Recruiting news, player features and game coverage.
        </p>

        ${
          u.media.length
            ? u.media.slice(0, 10).map(article => `
              <div class="moment">
                <div class="tiny">
                  ${esc(article.category)} ·
                  DAY ${article.day}
                </div>

                <h3>${esc(article.title)}</h3>

                <p class="muted">
                  ${esc(article.body)}
                </p>
              </div>
            `).join("")
            : `<p class="muted">
                No headlines yet. Big games and offers
                can generate coverage.
              </p>`
        }
      `;

      root.appendChild(panel);
    };
  }

  // =====================================
  // CHAT SCROLLING
  // =====================================

  const style = document.createElement("style");

  style.textContent = `
    #messages .inbox {
      height: 640px;
      max-height: 75vh;
      overflow: hidden;
    }

    #messages .thread-list {
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    #messages .chat {
      min-height: 0;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #messages .chat-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    #messages .chat-head,
    #messages .chat-compose {
      flex-shrink: 0;
    }

    @media (max-width: 650px) {
      #messages .inbox {
        height: auto;
        max-height: none;
        overflow: visible;
      }

      #messages .thread-list {
        max-height: 220px;
        overflow-y: auto;
      }

      #messages .chat {
        height: 440px;
      }
    }
  `;

  document.head.appendChild(style);

  update();
  renderAll();

  console.log("FIELDHOUSE Career Update loaded.");
})();

