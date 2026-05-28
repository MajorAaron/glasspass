// Glasspass — tool client logic
const form = document.getElementById('tasteForm');
const submitBtn = document.getElementById('submitBtn');
const btnLabel = submitBtn.querySelector('.btn-label');
const btnSpinner = submitBtn.querySelector('.btn-spinner');
const resultsBox = document.getElementById('results');
const errorBox = document.getElementById('errorBox');
const flavorTags = document.getElementById('flavorTags');
const beerRecs = document.getElementById('beerRecs');
const breweryRecs = document.getElementById('breweryRecs');
const restartBtn = document.getElementById('restartBtn');
const emailForm = document.getElementById('emailForm');
const emailInput = document.getElementById('emailInput');
const emailStatus = document.getElementById('emailStatus');

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnLabel.hidden = loading;
  btnSpinner.hidden = !loading;
}

function showError(msg) {
  errorBox.hidden = false;
  errorBox.textContent = msg;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function renderResults(data) {
  flavorTags.innerHTML = '';
  (data.flavor_profile || []).forEach(tag => {
    const el = document.createElement('span');
    el.className = 'flavor-tag';
    el.textContent = tag;
    flavorTags.appendChild(el);
  });

  beerRecs.innerHTML = '';
  (data.beer_recommendations || []).forEach(rec => {
    const card = document.createElement('div');
    card.className = 'rec-card';
    card.innerHTML = `
      <div class="rec-name">${escapeHtml(rec.name || '')}</div>
      <div class="rec-style">${escapeHtml(rec.style || '')}</div>
      <p class="rec-reason">${escapeHtml(rec.reason || '')}</p>
    `;
    beerRecs.appendChild(card);
  });

  breweryRecs.innerHTML = '';
  (data.brewery_recommendations || []).forEach(rec => {
    const card = document.createElement('div');
    card.className = 'rec-card brewery';
    card.innerHTML = `
      <div class="rec-name">${escapeHtml(rec.name || '')}</div>
      <div class="rec-style">${escapeHtml(rec.location || '')}</div>
      <p class="rec-reason">${escapeHtml(rec.reason || '')}</p>
    `;
    breweryRecs.appendChild(card);
  });

  resultsBox.hidden = false;
  resultsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  setLoading(true);
  const beers_loved = document.getElementById('beersLoved').value.trim();
  const region = document.getElementById('region').value.trim();
  if (window.posthog) posthog.capture('glasspass_tool_submitted', { region });
  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beers_loved, region })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }
    const data = await resp.json();
    renderResults(data);
    if (window.posthog) posthog.capture('glasspass_tool_completed', { region });
  } catch (err) {
    showError(err.message || 'Something went wrong. Try again in a moment.');
  } finally {
    setLoading(false);
  }
});

restartBtn.addEventListener('click', () => {
  resultsBox.hidden = true;
  form.reset();
  emailStatus.textContent = '';
  emailStatus.className = 'status';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) return;
  emailStatus.textContent = 'Sending…';
  emailStatus.className = 'status';
  try {
    const resp = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'tool_email_capture' })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Subscription failed');
    emailStatus.textContent = 'Pours-coming. Your passport will arrive in 10–14 days.';
    emailStatus.className = 'status success';
    emailInput.value = '';
    if (window.posthog) posthog.capture('glasspass_email_captured', { source: 'tool' });
  } catch (err) {
    emailStatus.textContent = err.message;
    emailStatus.className = 'status err';
  }
});
