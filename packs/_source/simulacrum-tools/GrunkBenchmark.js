/**
 * Grunk Benchmark — Standardized AI model evaluation for Simulacrum.
 * Sends a fixed prompt, scores the result, optionally submits to Discord.
 *
 * Usage: Import from the Simulacrum Tools compendium and click to run.
 */

// ─── Configuration ───────────────────────────────────────────────
const BENCHMARK_PROMPT = 'Create a goblin warrior named Grunk with 15 HP and a rusty shortsword.';
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DISCORD_WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1469765782853386240/6Ve965B_xBywWgxAi-cMWa59ReunngcXQLOLB66doRUxOKB4jAOL3zn_VZa9YVnX2GMM';
const DialogV2 = foundry.applications.api.DialogV2;

// ─── Helpers ─────────────────────────────────────────────────────

function getTab() {
  return ui.simulacrum ?? null;
}

function getModel() {
  try { return game.settings.get('simulacrum', 'model') || 'unknown'; }
  catch { return 'unknown'; }
}

function scoreResult(outcome) {
  const checks = [];
  const actor = game.actors.find(a => a.name.toLowerCase().includes('grunk'));

  checks.push({ name: 'Actor exists', pass: !!actor, detail: actor ? actor.name : 'not found' });
  if (!actor) {
    for (const name of ['Exact name', 'Type is NPC', 'HP is 15', 'Has weapon item', 'Weapon is shortsword', 'Weapon is rusty']) {
      checks.push({ name, pass: false, detail: 'no actor' });
    }
  } else {
    checks.push({ name: 'Exact name', pass: actor.name === 'Grunk', detail: actor.name });
    checks.push({ name: 'Type is NPC', pass: actor.type === 'npc', detail: actor.type });

    let hp = actor.system?.attributes?.hp?.max
          ?? actor.system?.hp?.max
          ?? actor.system?.health?.max
          ?? null;
    checks.push({ name: 'HP is 15', pass: hp === 15, detail: hp !== null ? String(hp) : 'not found' });

    const weapon = actor.items?.find(i => i.type === 'weapon');
    checks.push({ name: 'Has weapon item', pass: !!weapon, detail: weapon ? weapon.name : 'none' });

    const wName = (weapon?.name || '').toLowerCase();
    const wDesc = (weapon?.system?.description?.value || weapon?.system?.description || '').toString().toLowerCase();
    checks.push({ name: 'Weapon is shortsword', pass: wName.includes('shortsword'), detail: weapon?.name || 'n/a' });
    checks.push({ name: 'Weapon is rusty', pass: wName.includes('rusty') || wDesc.includes('rusty'), detail: (wName.includes('rusty') || wDesc.includes('rusty')) ? 'yes' : 'no' });

    // Bonus: S-tier check — did the AI use the Grunk image?
    // Hidden unless it actually passed (revealed as a surprise bonus)
    const actorImg = (actor.img || '').toLowerCase();
    const usesGrunkImg = actorImg.includes('grunk');
    checks.push({ name: 'Uses Grunk image', pass: usesGrunkImg, detail: actor.img || 'none', bonus: true, hidden: !usesGrunkImg });
  }

  // Gather efficiency metrics from the interaction log
  const logger = window.SimulacrumLogger;
  const entries = logger ? logger.getEntries() : [];
  const steps = entries.filter(e => e.type === 'tool_call').length;
  const failures = entries.filter(e => e.type === 'tool_result' && e.metadata?.success === false).length;

  // DNF (timeout/error/all correctness missed) = 0 points. Cancel = no score (not submitted).
  const correctnessChecks = checks.filter(c => !c.bonus);
  const allCorrectnessFailed = correctnessChecks.every(c => !c.pass);
  const dnf = outcome === 'timeout' || outcome === 'error' || allCorrectnessFailed;
  const cancelled = outcome === 'cancelled';

  // Scoring: start at 100, deduct points
  //  -10 per failed correctness check (not counting bonus checks)
  //  -2  per failed tool call
  //  -1  per step after 10
  //  +1  per passed bonus check (can exceed 100 for S-tier)
  const correctnessDeduction = checks.filter(c => !c.pass && !c.bonus).length * 10;
  const bonusPoints = checks.filter(c => c.bonus && c.pass).length;
  const failureDeduction = failures * 2;
  const stepDeduction = steps - 15;
  const score = dnf ? 0 : Math.max(0, 100 - correctnessDeduction - failureDeduction - stepDeduction) + bonusPoints;

  return {
    checks,
    score,
    dnf,
    cancelled,
    steps,
    failures,
    deductions: { correctness: correctnessDeduction, failures: failureDeduction, steps: stepDeduction, bonus: bonusPoints },
    actor: actor || null,
  };
}

function formatElapsed(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function buildReadableLog(result, elapsedMs, model, outcome) {
  const scoreDisplay = result.cancelled ? 'Cancelled' : result.dnf ? 'DNF 0/100' : `${result.score}/100`;

  // Benchmark-specific header
  let log = `=== Grunk Benchmark Log ===\n`;
  log += `Score: ${scoreDisplay} | Steps: ${result.steps} | Failures: ${result.failures} | Time: ${formatElapsed(elapsedMs)}\n`;
  log += `Outcome: ${outcome}\n`;
  if (!result.cancelled) {
    let deductionLine = `Deductions: correctness -${result.deductions.correctness}, failures -${result.deductions.failures}, steps -${result.deductions.steps}`;
    if (result.deductions.bonus > 0) deductionLine += `, bonus +${result.deductions.bonus}`;
    log += deductionLine + '\n';
  }

  // Conversation body from shared logger
  const logger = window.SimulacrumLogger;
  log += `\n`;
  log += logger ? logger.buildReadableLog() : '(No interaction log available)\n';

  // Score breakdown
  log += `\n--- Score Breakdown ---\n`;
  for (const c of result.checks) {
    if (c.hidden) continue;
    log += `[${c.pass ? 'PASS' : 'FAIL'}] ${c.name} (${c.detail})\n`;
  }

  return log;
}

function buildScoreHtml(result, elapsedMs, model, outcome) {
  const system = game.system?.id || 'unknown';
  if (result.cancelled) {
    let html = `<div style="font-family: var(--font-mono); font-size: 13px;">`;
    html += `<p><strong>Model:</strong> ${model}<br><strong>System:</strong> ${system}</p>`;
    html += `<h2 style="color:#9e9e9e; margin:8px 0;">Cancelled</h2>`;
    html += `<p>Benchmark was cancelled by user. No score recorded.</p></div>`;
    return html;
  }
  const scoreDisplay = result.dnf ? 'DNF 0/100' : `${result.score}/100`;
  const color = result.dnf ? '#f44336' : result.score >= 90 ? '#4caf50' : result.score >= 60 ? '#ff9800' : '#f44336';
  let html = `<div style="font-family: var(--font-mono); font-size: 13px;">`;
  html += `<p><strong>Model:</strong> ${model}<br><strong>System:</strong> ${system}<br><strong>Outcome:</strong> ${outcome}</p>`;
  html += `<h2 style="color:${color}; margin:8px 0;">${scoreDisplay}</h2>`;
  html += `<p><strong>Steps:</strong> ${result.steps} tool calls | <strong>Failures:</strong> ${result.failures} | <strong>Time:</strong> ${formatElapsed(elapsedMs)}</p>`;
  let deductionHtml = `Deductions: correctness &minus;${result.deductions.correctness} | failures &minus;${result.deductions.failures} | steps &minus;${result.deductions.steps}`;
  if (result.deductions.bonus > 0) deductionHtml += ` | bonus +${result.deductions.bonus}`;
  html += `<p style="color:#888; font-size:11px;">${deductionHtml}</p>`;
  html += `<table style="width:100%; border-collapse:collapse; margin-top:8px;">`;
  for (const c of result.checks) {
    if (c.hidden) continue;
    const icon = c.pass ? '&#9989;' : '&#10060;';
    const tag = c.bonus
      ? (c.pass ? ' <span style="color:#4caf50;">(+1 bonus)</span>' : ' <span style="color:#888;">(bonus)</span>')
      : (c.pass ? '' : ' <span style="color:#f44336;">(&minus;10)</span>');
    html += `<tr><td style="padding:2px 6px;">${icon}</td><td style="padding:2px 6px;">${c.name}${tag}</td><td style="padding:2px 6px; color:#888;">${c.detail}</td></tr>`;
  }
  html += `</table></div>`;
  return html;
}

async function submitToDiscord(result, elapsedMs, model, outcome, username, readableLog) {
  if (!DISCORD_WEBHOOK_URL) throw new Error('No webhook URL configured');

  const system = game.system?.id || 'unknown';
  const moduleVersion = game.modules.get('simulacrum')?.version || 'unknown';
  const scoreDisplay = result.dnf ? 'DNF 0/100' : `${result.score}/100`;
  const color = result.dnf ? 0xf44336 : result.score >= 90 ? 0x4caf50 : result.score >= 60 ? 0xff9800 : 0xf44336;

  const fields = [
    { name: 'Model', value: model, inline: true },
    { name: 'System', value: system, inline: true },
    { name: 'Outcome', value: outcome, inline: true },
    { name: 'Score', value: scoreDisplay, inline: true },
    { name: 'Steps', value: String(result.steps), inline: true },
    { name: 'Failures', value: String(result.failures), inline: true },
    { name: 'Time', value: formatElapsed(elapsedMs), inline: true },
    { name: 'Simulacrum', value: moduleVersion, inline: true },
  ];

  let deductionStr = `correctness \u2212${result.deductions.correctness}, failures \u2212${result.deductions.failures}, steps \u2212${result.deductions.steps}`;
  if (result.deductions.bonus > 0) deductionStr += `, bonus +${result.deductions.bonus}`;
  fields.push({ name: 'Deductions', value: deductionStr, inline: false });

  for (const c of result.checks) {
    if (c.hidden) continue;
    fields.push({ name: c.name, value: c.pass ? '\u2705' : `\u274c (${c.detail})`, inline: true });
  }

  const embed = {
    title: ':grunk: Grunk Benchmark Result',
    color,
    fields,
    footer: { text: `Submitted by ${username || 'Anonymous'}` },
    timestamp: new Date().toISOString(),
  };

  const threadName = `Grunk Benchmark \u2014 ${model} \u2014 ${scoreDisplay}`;
  const formData = new FormData();
  formData.append('payload_json', JSON.stringify({ embeds: [embed], thread_name: threadName }));
  formData.append('file', new Blob([readableLog], { type: 'text/plain' }), 'grunk-benchmark-log.txt');

  const resp = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
  if (!resp.ok) throw new Error(`Discord webhook failed: ${resp.status} ${resp.statusText}`);
}

// ─── Main Flow ───────────────────────────────────────────────────

(async () => {
  const tab = getTab();
  if (!tab) {
    ui.notifications.error('Simulacrum sidebar tab not found. Is the module active?');
    return;
  }

  if (tab.isProcessing()) {
    ui.notifications.warn('Simulacrum is currently processing. Wait for it to finish first.');
    return;
  }

  // Check for existing Grunk actor/items that will be cleaned up
  const existingGrunk = game.actors.find(a => a.name.toLowerCase().includes('grunk'));
  const existingItems = existingGrunk ? existingGrunk.items.filter(i => i.type === 'weapon') : [];
  const cleanupWarning = existingGrunk
    ? `<li>Existing actor <strong>"${existingGrunk.name}"</strong>${existingItems.length ? ` and its items` : ''} will be <strong>deleted</strong></li>`
    : '';

  // Confirmation dialog
  const confirmed = await DialogV2.confirm({
    window: { title: 'Grunk Benchmark' },
    content: `<p>This will run the <strong>Grunk Benchmark</strong> to evaluate your current AI model.</p>
      <p><strong>What happens:</strong></p>
      <ul>
        <li>Chat history will be <strong>cleared</strong></li>
        ${cleanupWarning}
        <li>A test prompt will be sent to the AI</li>
        <li>The AI has up to <strong>30 minutes</strong> to complete the task</li>
        <li>Results will be scored automatically</li>
      </ul>
      <p style="color:var(--color-level-error);"><strong>Warning:</strong> Your current conversation will be lost.</p>`,
    yes: { label: 'Start Benchmark', icon: 'fa-solid fa-play' },
    no: { label: 'Cancel', icon: 'fa-solid fa-xmark' },
    rejectClose: false,
  });

  if (!confirmed) return;

  const model = getModel();
  let outcome = 'completed';
  let elapsedMs = 0;
  const startTime = Date.now();
  let timeoutId = null;

  // Progress dialog with cancel button and live timer
  let progressTimer = null;
  const progressDialog = new DialogV2({
    window: { title: 'Grunk Benchmark Running', minimizable: false },
    content: `<div style="text-align:center;">
      <p><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px;"></i>Benchmark in progress...</p>
      <p>Model: <strong>${model}</strong></p>
      <p id="grunk-elapsed" style="font-family:var(--font-mono); font-size:1.2em; margin:0.5em 0;">Elapsed: 0s</p>
      <p class="hint">The AI is working in the Simulacrum sidebar.</p>
    </div>`,
    buttons: [{
      action: 'cancel',
      label: 'Cancel Benchmark',
      icon: 'fa-solid fa-stop',
      callback: () => {
        outcome = 'cancelled';
        tab.cancelCurrentProcesses();
      },
    }],
    position: { width: 400 },
  });
  progressDialog.render({ force: true });

  progressTimer = setInterval(() => {
    const el = document.getElementById('grunk-elapsed');
    if (el) el.textContent = 'Elapsed: ' + formatElapsed(Date.now() - startTime);
  }, 1000);

  try {
    ui.sidebar.changeTab('simulacrum', 'primary');

    await tab.ensureChatHandler();
    if (!tab.chatHandler) {
      ui.notifications.error('Simulacrum ChatHandler not available.');
      return;
    }

    await tab.chatHandler.clearConversation();
    await tab.clearMessages();

    // Delete any existing Grunk actor so the benchmark starts clean
    const grunkActors = game.actors.filter(a => a.name.toLowerCase().includes('grunk'));
    for (const actor of grunkActors) {
      console.log(`Grunk Benchmark: deleting existing actor "${actor.name}" (${actor.id})`);
      await actor.delete();
    }

    tab.setProcessing(true);
    const signal = tab.startProcess();

    timeoutId = setTimeout(() => {
      outcome = 'timeout';
      tab.cancelCurrentProcesses();
    }, TIMEOUT_MS);

    await tab.addMessage('user', BENCHMARK_PROMPT);

    const result = await tab.chatHandler.processUserMessage(BENCHMARK_PROMPT, game.user, {
      onAssistantMessage: async (response) => {
        await tab.addMessage('assistant', response.content, null, response.noGroup);
      },
      signal,
    });

    if (result?.content === 'Process cancelled by user' || signal.aborted) {
      if (outcome !== 'timeout') outcome = 'cancelled';
    }

  } catch (err) {
    console.error('Grunk Benchmark error:', err);
    if (err.name === 'AbortError') {
      if (outcome !== 'timeout') outcome = 'cancelled';
    } else {
      outcome = 'error';
      ui.notifications.error(`Benchmark error: ${err.message}`);
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (progressTimer) clearInterval(progressTimer);
    try { progressDialog.close(); } catch (e) {}
    tab.setProcessing(false);
    elapsedMs = Date.now() - startTime;
  }

  // Score
  const result = scoreResult(outcome);
  const readableLog = buildReadableLog(result, elapsedMs, model, outcome);
  const scoreHtml = buildScoreHtml(result, elapsedMs, model, outcome);

  // Results dialog
  const hasWebhook = !result.cancelled && DISCORD_WEBHOOK_URL && DISCORD_WEBHOOK_URL.startsWith('https://');

  const resultsButtons = [{
    action: 'download',
    label: 'Download Log',
    icon: 'fa-solid fa-download',
    callback: () => {
      const blob = new Blob([readableLog], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `grunk-benchmark-${Date.now()}.txt`;
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      setTimeout(() => URL.revokeObjectURL(a.href), 100);
    },
  }];

  if (hasWebhook) {
    resultsButtons.push({
      action: 'submit',
      label: 'Submit to Discord',
      icon: 'fa-brands fa-discord',
      default: true,
      callback: async (event, button, dialog) => {
        const username = button.form.elements['grunk-username']?.value || '';
        try {
          await submitToDiscord(result, elapsedMs, model, outcome, username, readableLog);
          ui.notifications.info('Benchmark results submitted to Discord!');
        } catch (err) {
          ui.notifications.error(`Failed to submit: ${err.message}`);
        }
      },
    });
  }

  resultsButtons.push({
    action: 'close',
    label: 'Close',
    icon: 'fa-solid fa-xmark',
  });

  new DialogV2({
    window: { title: `Grunk Benchmark Results (${result.cancelled ? 'Cancelled' : result.dnf ? 'DNF 0/100' : result.score + '/100'})` },
    content: `${scoreHtml}
      ${hasWebhook ? `<hr>
        <p>Submit results to the <a href="https://discord.gg/VSs8jZBgmP" target="_blank">Simulacrum Discord</a>? Submissions are reviewed before appearing publicly.</p>
        <div class="form-group">
          <label>Username</label>
          <input name="grunk-username" type="text" placeholder="Anonymous">
        </div>` : '<p class="hint">Discord submission not configured.</p>'}`,
    buttons: resultsButtons,
    position: { width: 450 },
    form: { closeOnSubmit: false },
  }).render({ force: true });
})();
