
/* LAXR / FIELDHOUSE — gameplay update 1
   Load after the original inline game script. Keeps the existing save key.
*/
(() => {
  'use strict';
  if (typeof state === 'undefined' || typeof renderAll !== 'function') {
    console.error('LAXR: original game must load before updates.js'); return;
  }
  const U = () => {
    if (!state.upgradeV1) state.upgradeV1 = { dayActions: 0, daysUntilGame: 3, gamesSeen: 0, recruitingCycles: 0, recentCoaches: [], strategy: null };
    return state.upgradeV1;
  };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const weekDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dayName = () => weekDays[((state.calendarDay || 1) - 1) % 7];
  const phase = () => state.season.phase || 'junior_regular';
  const canContact = () => !['sophomore_playoffs','summer_before_junior'].includes(phase());
  const unplayed = () => state.season.schedule.find(g => !g.played);
  function setNotice(s) { toast(s); }
  function renderTimePanel() {
    if (!state.created || state.committed) return;
    const season = $('season');
    if (!season) return;
    season.querySelector('#laxr-week-panel')?.remove();
    const box = document.createElement('div');
    box.id = 'laxr-week-panel'; box.className = 'panel'; box.style.marginBottom = '14px';
    const u = U(), game = unplayed(), days = u.daysUntilGame;
    box.innerHTML = `<div class="row" style="justify-content:space-between"><div><div class="tiny">CAREER DAY ${state.calendarDay} · ${dayName()}</div><h2 style="margin:5px 0">${game ? (days ? days+' days until '+esc(game.opponent) : 'GAME DAY · '+esc(game.opponent)) : 'Schedule complete'}</h2><div class="muted">Your week matters even when there is no game. ${days >= 6 ? 'BYE WEEK — extra preparation time.' : ''}</div></div><span class="badge lime">${u.dayActions}/2 ACTIONS TODAY</span></div><div class="divider"></div><div class="row"><button class="btn lime" onclick="laxrDay('practice')">Position practice</button><button class="btn" onclick="laxrDay('film')">Study opponent film</button><button class="btn ghost" onclick="laxrDay('recovery')">Recover</button><button class="btn ghost" onclick="laxrDay('recruit')">Recruiting time</button><button class="btn ghost" onclick="laxrNextDay()">Next day →</button></div><p class="muted" style="font-size:11px;margin-bottom:0">Two actions per day. Film study helps your next game; practice develops skills gradually. You can advance days without spending both actions.</p>`;
    const target = season.querySelector('.panel');
    if (target) target.parentNode.insertBefore(box,target); else season.prepend(box);
  }
  const priorRenderSeason = renderSeason;
  renderSeason = function () { priorRenderSeason(); renderTimePanel(); };
  const priorRenderDashboard = renderDashboard;
  renderDashboard = function () {
    priorRenderDashboard();
    const btn = $('dashboard')?.querySelector('button[onclick="playNextGame()"]');
    if (btn) { btn.textContent = U().daysUntilGame > 0 ? 'Go to weekly calendar →' : 'Play game →'; btn.onclick = () => U().daysUntilGame > 0 ? showView('season') : playNextGame(); }
  };
  window.laxrNextDay = function () {
    if (!state.created || state.committed) return;
    const u = U();
    state.calendarDay++;
    u.dayActions = 0;
    if (u.daysUntilGame > 0) u.daysUntilGame--;
    state.training.fatigue = clamp((state.training.fatigue || 0) - 5,0,100);
    if (state.calendarDay % 7 === 0) { u.recruitingCycles++; recruitingCycle(); }
    save(); renderAll(); showView('season');
  };
  window.laxrDay = function (kind) {
    const u = U(); if (u.dayActions >= 2) return setNotice('Two activities used today. Advance to tomorrow.');
    u.dayActions++;
    const p = state.player, t = state.training, stats = p.stats, attrs = ATTRS[p.position];
    if (kind === 'practice') {
      const a = pick(attrs.filter(x => x !== 'Lacrosse IQ'));
      stats[a] = Math.round(clamp((stats[a] || 60) + .25 + Math.random() * .3, 0, 99) * 10) / 10;
      t.fatigue = clamp((t.fatigue || 0) + 7,0,100); t.work = (t.work || 0) + 1;
      act('Practiced '+a+'. Small skill improvement.');
    } else if (kind === 'film') {
      stats['Lacrosse IQ'] = Math.round(clamp((stats['Lacrosse IQ'] || 60) + .25,0,99) * 10) / 10;
      p.iq = stats['Lacrosse IQ']; u.filmPrepared = clamp((u.filmPrepared || 0) + 1,0,3);
      t.film = (t.film || 0) + 1; act('Studied opponent film. Improved IQ and game preparation.');
    } else if (kind === 'recovery') {
      t.fatigue = clamp((t.fatigue || 0) - 22,0,100); act('Recovered and reduced fatigue.');
    } else {
      const interested = PROGRAMS.map((s,i) => ({s,i,pr:ensureProgram(i)})).filter(x => x.pr.interest >= 45 && !x.pr.offer);
      if (interested.length) { const x = pick(interested); x.pr.interest = clamp(x.pr.interest + 1,0,99); act('Updated '+x.s[0]+' with your schedule.'); }
      else act('Organized your recruiting profile and upcoming schedule.');
    }
    save(); renderAll(); showView('season');
  };
  // Prevent the original game from generating dozens of offers per match.
  offerSchool = function (i) {
    const s = PROGRAMS[i], pr = ensureProgram(i), u = U();
    if (!canContact() || pr.offer || state.offers.some(o => o.school === s[0]) || pr.committedRecruits >= pr.need) return;
    if (u.recruitingCycles < 3 || (u.lastOfferDay && state.calendarDay - u.lastOfferDay < 28)) return;
    pr.offer = true; u.lastOfferDay = state.calendarDay;
    state.offers.push({school:s[0],division:s[1],day:state.calendarDay});
    newThread(s[0]+' · Recruiting','coach',i,`Our staff has evaluated your film over several weeks. We believe you could fit our program, and we'd like to offer you a place in our recruiting class. Let's discuss the next steps.`);
    act('MAJOR MILESTONE: First-class recruiting offer from '+s[0]+'.');
    save();
  };
  function recruitingCycle() {
    if (!canContact()) return;
    const u = U(), eligible = [];
    PROGRAMS.forEach((s,i) => {
      const pr = ensureProgram(i), existing = state.threads.some(t => t.kind === 'coach' && t.schoolId === i);
      const geo = geoFit(s), club = clubTier();
      const target = clamp((avg()-62)*.6 + (state.player.film || 0)*.13 + (state.player.exposure || 0)*.16 + (s[1]==='D-I' ? -7 : s[1]==='D-II' ? 0 : 4),-3,15);
      pr.interest = clamp(pr.interest + (Math.random() < .3 ? 1 : 0) + (target > 6 ? 1 : 0),0,99);
      if (pr.committedRecruits >= pr.need || pr.offer) return;
      if (!existing && pr.interest > 57 && Math.random() < .045 * geo * club) {
        const detail = state.season.lastResult ? `We watched your recent work against ${state.season.lastResult.opponent}.` : 'We have been following your development.';
        newThread(s[0]+' · Recruiting','coach',i,pick([
          `Coach here from ${s[0]}. ${detail} We are reviewing our ${state.player.position.toLowerCase()} board.`,
          `Our staff has your film. We'd like to learn more about your club schedule before deciding on next steps.`,
          `We've been tracking your progression. How is your season going, and what are you focusing on improving?`
        ]));
        act(s[0]+' started evaluating you.');
      }
      const evalDays = state.calendarDay - (pr.lastContact || 0);
      const threshold = s[1]==='D-I' ? 89 : s[1]==='D-II' ? 83 : 79;
      const rating = s[1]==='D-I' ? 77 : s[1]==='D-II' ? 70 : 67;
      if (existing && evalDays >= 21 && pr.interest >= threshold && avg() >= rating) eligible.push(i);
    });
    if (eligible.length && Math.random() < .16) offerSchool(pick(eligible));
  }
  recruitingTick = function () { /* weekly recruiting is handled by calendar, not each game */ };
  automaticRecruitingSweep = function () { /* avoid global interest/offer spikes */ };
  // More than one decision, with a different tactical situation from game to game.
  const originalPlay = playNextGame;
  const originalResolve = resolveGame;
  const situations = [
    {title:'Down one · 1:04 left',desc:'Your team has possession and one timeout. What is the plan?',options:[['push','Push the tempo'],['settle','Settle into a set play'],['timeout','Call timeout and draw something up']]},
    {title:'Up two · 2:15 left',desc:'The opponent is pressing and trying to force a turnover.',options:[['protect','Protect possession'],['attack','Attack the open space'],['timeout','Call timeout to settle down']]},
    {title:'Tied · fourth quarter',desc:'Their best player is heating up. How do you respond?',options:[['matchup','Adjust the matchup'],['team','Trust the base scheme'],['pressure','Increase pressure']]},
    {title:'Man-down · one-minute penalty',desc:'Your team needs a stop. Pick your approach.',options:[['compact','Protect the crease'],['aggressive','Pressure the ball'],['communicate','Organize the rotation']]},
    {title:'Late third · trailing by three',desc:'You need momentum before the fourth quarter.',options:[['controlled','Play disciplined lacrosse'],['fast','Push transition'],['timeout','Reset the team']]}
  ];
  playNextGame = function () {
    if (!unplayed()) return originalPlay();
    if (U().daysUntilGame > 0) { showView('season'); setNotice('Game is in '+U().daysUntilGame+' days. Use your week to prepare.'); return; }
    const u = U(); u.strategy = null;
    const situation = situations[(u.gamesSeen + Math.floor(Math.random()*2)) % situations.length];
    u.pendingSituation = situation;
    openModal(`<button class="close" onclick="closeModal()">Close</button><div class="eyebrow">GAME DAY · ${esc(unplayed().opponent)}</div><h2>${esc(situation.title)}</h2><p class="muted">${esc(situation.desc)}</p><div class="moment"><b>Decision 1 of 2 · Team strategy</b><div class="row" style="margin-top:12px">${situation.options.map((o,i)=>`<button class="btn ${i===0?'lime':'ghost'}" onclick="laxrStrategy('${o[0]}')">${esc(o[1])}</button>`).join('')}</div></div>`);
  };
  window.laxrStrategy = function (choice) {
    const u = U(); u.strategy = choice;
    originalPlay();
    const heading = $('modalBox')?.querySelector('h2');
    if (heading) heading.insertAdjacentHTML('beforebegin','<div class="eyebrow">DECISION 2 OF 2 · YOUR DEFINING PLAY</div>');
  };
  resolveGame = function (action) {
    const u = U();
    const prep = u.filmPrepared || 0;
    const beforeFatigue = state.training.fatigue || 0;
    const strategyBonus = ['protect','settle','matchup','compact','controlled','communicate'].includes(u.strategy) ? 4 : ['push','attack','pressure','aggressive','fast'].includes(u.strategy) ? -2 : 2;
    state.training.fatigue = clamp(beforeFatigue - prep * 4 - strategyBonus,0,100);
    originalResolve(action);
    // Original simulation updates fatigue after the match; restore the normal fatigue basis.
    state.training.fatigue = clamp(beforeFatigue + 12,0,100);
    u.gamesSeen++; u.filmPrepared = 0; u.strategy = null; u.dayActions = 0;
    u.daysUntilGame = (u.gamesSeen % 5 === 0 ? 10 : 4 + Math.floor(Math.random()*3));
    save();
  };
  const originalAdvance = advanceCareerPhase;
  advanceCareerPhase = function () { originalAdvance(); U().daysUntilGame = 3; U().dayActions = 0; save(); renderAll(); };
  // Existing saved offers are retained rather than silently deleted.
  U();
  renderAll();
  console.log('LAXR gameplay update 1 loaded');
})();
