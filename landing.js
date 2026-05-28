// Glasspass — landing page form handlers
document.querySelectorAll('.cta-form').forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button');
    const status = form.parentElement.querySelector('.form-status');
    const email = input.value.trim();
    const source = form.dataset.source || 'landing';
    if (!email) return;
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Sending…';
    status.textContent = '';
    status.className = 'form-status';
    try {
      const resp = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Could not submit');
      status.textContent = source === 'brewery_signup'
        ? "Cheers — your kit will arrive in 10–14 days."
        : "Thanks — we'll be in touch within 24 hours.";
      status.className = 'form-status success';
      input.value = '';
      if (window.posthog) posthog.capture('glasspass_landing_signup', { source });
    } catch (err) {
      status.textContent = err.message;
      status.className = 'form-status err';
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
});
