/* Browser behavior for the static Cloudflare Pages site. No framework needed. */
(() => {
  'use strict';

  const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdgR_7sZHjPlY1AePgv7UKmRWUFgGaydVZdMUBrmGCEKIgJ9Q/viewform';
  const EMAIL_URL = 'mailto:yrtirving@gmail.com';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function icon(paths, size = 18, className = '') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const [name, value] of Object.entries({
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
    })) svg.setAttribute(name, String(value));
    if (className) svg.setAttribute('class', className);
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  function arrow() { return icon(['M5 12h14', 'm12 5 7 7-7 7']); }

  const menu = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.primary-nav');
  if (menu && navigation) {
    function setMenu(open) {
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      navigation.classList.toggle('is-open', open);
      menu.replaceChildren(icon(open ? ['M18 6 6 18', 'm6 6 12 12'] : ['M4 6h16', 'M4 12h16', 'M4 18h16'], 23));
    }
    menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
    navigation.addEventListener('click', event => {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menu.focus();
      }
    });
  }

  for (const form of document.querySelectorAll('form[data-signup-form], form.signup-form')) {
    const card = form.closest('.signup-card');
    const button = form.querySelector('button[type="submit"]');
    if (!card || !button) continue;
    const fields = Object.fromEntries(['name', 'email', 'phone', 'website'].map(name => [name, form.elements.namedItem(name)]));
    if (!fields.name || !fields.email || !fields.phone) continue;
    let busy = false;
    let uncertain = false;
    let status = card.querySelector('#signup-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'signup-status';
      form.insertBefore(status, button);
    }
    status.className = 'form-error';
    status.setAttribute('role', 'alert');
    status.setAttribute('tabindex', '-1');
    status.hidden = true;

    function resetErrors() {
      status.hidden = true;
      status.replaceChildren();
      for (const name of ['name', 'email', 'phone']) {
        fields[name].setCustomValidity('');
        fields[name].setAttribute('aria-invalid', 'false');
        fields[name].removeAttribute('aria-describedby');
        form.querySelector(`#${name}-error`)?.remove();
      }
    }

    function fieldError(name, message) {
      if (!['name', 'email', 'phone'].includes(name) || typeof message !== 'string') return;
      fields[name].setAttribute('aria-invalid', 'true');
      fields[name].setAttribute('aria-describedby', `${name}-error`);
      const error = document.createElement('p');
      error.className = 'field-error';
      error.id = `${name}-error`;
      error.textContent = message;
      fields[name].insertAdjacentElement('afterend', error);
    }

    function setButton() {
      button.disabled = busy || uncertain;
      button.replaceChildren(
        document.createTextNode(busy ? 'Sending your signup ' : 'Join the list '),
        busy ? icon(['M12 2v4', 'm16.2 7.8 2.9-2.9', 'M18 12h4', 'm16.2 16.2 2.9 2.9', 'M12 18v4', 'm4.9 19.1 2.9-2.9', 'M2 12h4', 'm4.9 4.9 2.9 2.9'], 18, 'spin') : arrow(),
      );
      form.setAttribute('aria-busy', String(busy));
    }

    function showError(result) {
      uncertain = result.submissionState === 'uncertain';
      status.textContent = result.message;
      if (uncertain) {
        const email = document.createElement('a');
        email.href = EMAIL_URL;
        email.append('Email us ', icon(['M15 3h6v6', 'M10 14 21 3', 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5'], 13));
        status.append(email);
        const alternative = card.querySelector('.form-alternative');
        if (alternative) { alternative.open = false; alternative.hidden = true; }
      }
      if (result.fieldErrors && typeof result.fieldErrors === 'object') {
        for (const [name, message] of Object.entries(result.fieldErrors)) fieldError(name, message);
      }
      status.hidden = false;
      requestAnimationFrame(() => status.focus());
    }

    function showSuccess(message) {
      const success = document.createElement('div');
      success.className = 'signup-success';
      success.setAttribute('role', 'status');
      success.setAttribute('tabindex', '-1');
      const mark = document.createElement('span');
      mark.className = 'success-mark';
      mark.append(icon(['m20 6-11 11-5-5'], 28));
      const label = document.createElement('p');
      label.className = 'eyebrow';
      label.textContent = 'You’re on the list';
      const heading = document.createElement('h3');
      heading.append('See you around', document.createElement('br'), 'Irving.');
      const paragraph = document.createElement('p');
      paragraph.textContent = message;
      const events = document.createElement('a');
      events.className = 'text-link';
      events.href = '/events';
      events.append('Explore our events ', arrow());
      success.append(mark, label, heading, paragraph, events);
      card.replaceChildren(success);
      requestAnimationFrame(() => success.focus());
    }

    for (const name of ['name', 'email', 'phone']) {
      fields[name].addEventListener('input', () => {
        fields[name].setCustomValidity('');
        fields[name].setAttribute('aria-invalid', 'false');
        fields[name].removeAttribute('aria-describedby');
        form.querySelector(`#${name}-error`)?.remove();
      });
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || uncertain) return;
      resetErrors();
      const values = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, typeof field?.value === 'string' ? field.value.trim() : '']));
      const controls = /[\u0000-\u001f\u007f]/;
      const errors = {};
      if (!values.name || values.name.length > 120 || controls.test(values.name)) errors.name = 'Please enter your name (up to 120 characters).';
      if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || controls.test(values.email)) errors.email = 'Please enter a valid email address.';
      const phoneDigits = values.phone.replace(/\D/g, '').length;
      if (values.phone.length > 40 || phoneDigits < 7 || phoneDigits > 20 || controls.test(values.phone)) errors.phone = 'Please enter a valid phone number.';
      for (const [name, message] of Object.entries(errors)) fields[name].setCustomValidity(message);
      if (!form.reportValidity()) {
        for (const [name, message] of Object.entries(errors)) fieldError(name, message);
        return;
      }

      busy = true;
      setButton();
      const controller = new AbortController();
      // The server allows two bounded upstream requests. A browser timeout must
      // be treated as uncertain, never as permission to repeat the submission.
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(values),
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Unconfirmed response');
        const result = await response.json();
        if (!result || typeof result.ok !== 'boolean' || typeof result.message !== 'string') throw new Error('Unconfirmed response');
        if (result.ok) {
          if (!response.ok) throw new Error('Unconfirmed response');
          form.reset();
          showSuccess(result.message);
        } else {
          if (!['not_sent', 'rejected', 'uncertain'].includes(result.submissionState)) throw new Error('Unconfirmed response');
          showError(result);
        }
      } catch {
        showError({
          ok: false,
          submissionState: 'uncertain',
          message: 'We couldn’t confirm whether your signup reached us. Please don’t submit again just yet. Contact us at yrtirving@gmail.com and we’ll check for you.',
        });
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (form.isConnected) setButton();
      }
    });
    // Keep the static button disabled until this handler is attached.
    setButton();
  }

  for (const details of document.querySelectorAll('.form-alternative')) {
    details.addEventListener('toggle', () => {
      if (!details.open || details.hidden || details.querySelector('iframe')) return;
      const content = details.querySelector('.form-alternative-content');
      if (!content) return;
      const frame = document.createElement('iframe');
      frame.title = 'Irving Young Republicans original signup form';
      frame.src = `${FORM_URL}?embedded=true`;
      frame.width = '100%';
      frame.height = '850';
      frame.loading = 'lazy';
      content.prepend(frame);
    });
  }

  const feeds = Array.from(document.querySelectorAll('.instagram-feed'));
  if (feeds.length) {
    const observers = [];
    const states = feeds.map(feed => {
      const container = feed.querySelector('.instagram-feed__embed');
      const status = feed.querySelector('.instagram-feed__status');
      if (!container || !status) return null;
      function setState(state) {
        feed.dataset.state = state;
        container.hidden = state === 'unavailable';
        container.setAttribute('aria-busy', String(state === 'loading'));
        status.textContent = state === 'loading' ? 'Loading Instagram…' : state === 'unavailable' ? 'Instagram isn’t displaying here. You can still see the latest posts on our profile.' : '';
      }
      function observeFrame() {
        const frame = container.querySelector('iframe');
        if (!frame) return false;
        frame.title = 'Instagram profile for Irving Young Republicans';
        // A cross-origin frame cannot prove the remote profile rendered.
        setState('requested');
        return true;
      }
      setState('loading');
      const observer = new MutationObserver(observeFrame);
      observer.observe(container, { childList: true, subtree: true });
      observers.push(observer);
      const timer = setTimeout(() => { if (!observeFrame()) setState('unavailable'); }, 10000);
      return { setState, observeFrame, timer };
    }).filter(Boolean);
    function processEmbeds() {
      try {
        if (!window.instgrm?.Embeds?.process) throw new Error('Instagram unavailable');
        window.instgrm.Embeds.process();
        for (const state of states) state.observeFrame();
      } catch {
        for (const state of states) state.setState('unavailable');
      }
    }
    if (window.instgrm?.Embeds?.process) {
      processEmbeds();
    } else {
      let script = document.querySelector('script[src="https://www.instagram.com/embed.js"]');
      const existing = Boolean(script);
      if (!script) script = document.createElement('script');
      script.addEventListener('load', processEmbeds, { once: true });
      script.addEventListener('error', () => states.forEach(state => state.setState('unavailable')), { once: true });
      if (!existing) {
        script.src = 'https://www.instagram.com/embed.js';
        script.async = true;
        document.body.append(script);
      }
    }
    window.addEventListener('pagehide', () => {
      for (const observer of observers) observer.disconnect();
      for (const state of states) clearTimeout(state.timer);
    }, { once: true });
  }
})();
