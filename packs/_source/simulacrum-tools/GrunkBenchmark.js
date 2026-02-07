/**
 * Grunk Benchmark — Standardized AI model evaluation for Simulacrum.
 * Sends a fixed prompt, scores the result, and provides guided Discord sharing.
 *
 * Usage: Import from the Simulacrum Tools compendium and click to run.
 */

// ─── Configuration ───────────────────────────────────────────────
const BENCHMARK_PROMPT = 'Create a goblin warrior named Grunk with 15 HP and a rusty shortsword.';
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DISCORD_INVITE_URL = 'https://discord.gg/YC4u8wbM6V';
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

function buildDiscordPostTitle(model, result) {
  const scoreDisplay = result.dnf ? 'DNF 0/100' : `${result.score}/100`;
  return `Grunk Benchmark \u2014 ${model} \u2014 ${scoreDisplay}`;
}

function buildDiscordPostBody(result, elapsedMs, model) {
  const system = game.system?.id || 'unknown';
  const moduleVersion = game.modules.get('simulacrum')?.version || 'unknown';
  const scoreDisplay = result.dnf ? 'DNF 0/100' : `${result.score}/100`;

  let body = `**Score: ${scoreDisplay}**\n`;
  body += `Model: ${model} | System: ${system} | Simulacrum: ${moduleVersion}\n`;
  body += `Steps: ${result.steps} | Failures: ${result.failures} | Time: ${formatElapsed(elapsedMs)}\n`;

  let deductions = `Deductions: correctness \u2212${result.deductions.correctness}, failures \u2212${result.deductions.failures}, steps \u2212${result.deductions.steps}`;
  if (result.deductions.bonus > 0) deductions += `, bonus +${result.deductions.bonus}`;
  body += deductions + '\n\n';

  for (const c of result.checks) {
    if (c.hidden) continue;
    body += `${c.pass ? '\u2705' : '\u274c'} ${c.name} (${c.detail})\n`;
  }

  return body;
}

function downloadLog(readableLog) {
  const blob = new Blob([readableLog], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `grunk-benchmark-${Date.now()}.txt`;
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
}

async function copyToClipboard(text, label) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      ui.notifications.info(`${label} copied to clipboard!`);
      return;
    } catch { /* fall through to legacy method */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  ui.notifications.info(`${label} copied to clipboard!`);
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
  const existingRusty = game.items.filter(i => i.name.toLowerCase().includes('rusty') && i.name.toLowerCase().includes('shortsword'));
  const warnings = [];
  if (existingGrunk) warnings.push(`<li>Existing actor <strong>"${existingGrunk.name}"</strong> and its items will be <strong>deleted</strong></li>`);
  if (existingRusty.length) warnings.push(`<li>Existing item${existingRusty.length > 1 ? 's' : ''} <strong>"${existingRusty.map(i => i.name).join('", "')}"</strong> will be <strong>deleted</strong></li>`);
  const cleanupWarning = warnings.join('\n        ');

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
      <p style="color:var(--color-level-error);"><strong>Warning:</strong> Your current conversation will be lost.</p>
      <p class="hint">If your AI provider charges per token, running this benchmark will incur costs.</p>`,
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

    // Delete any existing Grunk actors and Rusty Shortsword items so the benchmark starts clean
    const grunkActors = game.actors.filter(a => a.name.toLowerCase().includes('grunk'));
    for (const actor of grunkActors) {
      console.log(`Grunk Benchmark: deleting existing actor "${actor.name}" (${actor.id})`);
      await actor.delete();
    }
    const rustyItems = game.items.filter(i => i.name.toLowerCase().includes('rusty') && i.name.toLowerCase().includes('shortsword'));
    for (const item of rustyItems) {
      console.log(`Grunk Benchmark: deleting existing item "${item.name}" (${item.id})`);
      await item.delete();
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

  // Store share data for the guided share dialog
  const postTitle = buildDiscordPostTitle(model, result);
  const postBody = buildDiscordPostBody(result, elapsedMs, model);
  window._grunkShare = {
    download: () => downloadLog(readableLog),
    copyTitle: () => copyToClipboard(postTitle, 'Post title'),
    copyBody: () => copyToClipboard(postBody, 'Post body'),
  };

  // Results dialog
  const resultsButtons = [
    {
      action: 'download',
      label: 'Download Log',
      icon: 'fa-solid fa-download',
      callback: () => downloadLog(readableLog),
    },
  ];

  if (!result.cancelled) {
    resultsButtons.push({
      action: 'share',
      label: 'Share on Discord',
      icon: 'fa-brands fa-discord',
      default: true,
      callback: () => {
        const shareDialog = new DialogV2({
          window: { title: 'Share on Discord' },
          content: `<div style="display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; align-items: center; font-size: 13px;">
            <div><strong>1.</strong> Download the benchmark log</div>
            <div><button type="button" class="dialog-button"><i class="fa-solid fa-download"></i> Download</button></div>

            <div><strong>2.</strong> Open the Grunk Benchmark channel</div>
            <div><button type="button" class="dialog-button"><i class="fa-brands fa-discord"></i> Open Discord</button></div>

            <div><strong>3.</strong> Create a <strong>New Post</strong></div>
            <div></div>

            <div><strong>4.</strong> Copy the post title</div>
            <div><button type="button" class="dialog-button"><i class="fa-solid fa-copy"></i> Copy Title</button></div>

            <div><strong>5.</strong> Copy the post body</div>
            <div><button type="button" class="dialog-button"><i class="fa-solid fa-copy"></i> Copy Body</button></div>

            <div><strong>6.</strong> Upload the benchmark log</div>
            <div></div>

            <div><strong>7.</strong> Press <strong>Post</strong></div>
            <div></div>
          </div>`,
          buttons: [{ action: 'close', label: 'Done', icon: 'fa-solid fa-check' }],
          position: { width: 480 },
          close: () => { delete window._grunkShare; },
        });
        shareDialog.addEventListener('render', () => {
          const buttons = shareDialog.element.querySelectorAll('.dialog-content button');
          buttons[0]?.addEventListener('click', () => window._grunkShare.download());
          buttons[1]?.addEventListener('click', () => window.open(DISCORD_INVITE_URL, '_blank'));
          buttons[2]?.addEventListener('click', () => window._grunkShare.copyTitle());
          buttons[3]?.addEventListener('click', () => window._grunkShare.copyBody());
        });
        shareDialog.render({ force: true });
      },
    });
  }

  resultsButtons.push({
    action: 'close',
    label: 'Close',
    icon: 'fa-solid fa-xmark',
    callback: () => { delete window._grunkShare; },
  });

  new DialogV2({
    window: { title: `Grunk Benchmark Results (${result.cancelled ? 'Cancelled' : result.dnf ? 'DNF 0/100' : result.score + '/100'})` },
    content: scoreHtml,
    buttons: resultsButtons,
    position: { width: 450 },
  }).render({ force: true });
})();
