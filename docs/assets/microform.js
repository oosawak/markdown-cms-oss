/* microForm の送信側スクリプト。
 * contact.html（build.py が生成）に置かれたフォームから、設定 JSON
 * （#microform-config）を読み、microForm Worker へ JSON で POST する。
 * 宛先は Worker 側の登録で決まるため、ここには一切含まれない。 */
(() => {
  'use strict';
  const form = document.getElementById('microform');
  if (!form) return;
  const configEl = document.getElementById('microform-config');
  if (!configEl) return;
  let config;
  try {
    config = JSON.parse(configEl.textContent);
  } catch {
    return;
  }
  const status = form.querySelector('.mf-status');
  const button = form.querySelector('button[type="submit"]');
  const setStatus = (text) => {
    if (status) status.textContent = text;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = {};
    for (const el of form.querySelectorAll('[data-mf-field]')) {
      fields[el.name] = el.value;
    }
    let token = '';
    if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
      token = window.turnstile.getResponse() || '';
    } else {
      const hidden = form.querySelector('[name="cf-turnstile-response"]');
      token = hidden ? hidden.value : '';
    }
    const hpEl = form.querySelector('[name="hp"]');
    const payload = {
      site_id: config.siteId,
      fields,
      turnstile_token: token,
      hp: hpEl ? hpEl.value : '',
    };
    if (button) button.disabled = true;
    setStatus('送信しています…');
    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset();
        if (window.turnstile && typeof window.turnstile.reset === 'function') {
          window.turnstile.reset();
        }
        setStatus('送信しました。ありがとうございました。');
      } else if (data.error === 'validation_failed') {
        setStatus('入力が不足している項目があります。ご確認ください。');
      } else {
        setStatus('送信できませんでした。時間をおいて再度お試しください。');
      }
    } catch {
      setStatus('送信できませんでした。通信環境をご確認ください。');
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
