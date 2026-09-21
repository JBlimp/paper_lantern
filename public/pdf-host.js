(() => {
  if (
    window.top !== window ||
    document.contentType !== 'application/pdf' ||
    document.getElementById('paper-lantern-reader')
  )
    return;
  // Keep Chrome's PDF document and its native viewer alive underneath the reader.
  // Do not navigate, replace the document, or remove the PDF embed.
  const frame = document.createElement('iframe');
  frame.id = 'paper-lantern-reader';
  frame.title = 'Paper Lantern PDF 번역';
  frame.allow = 'translator; clipboard-write';
  frame.src = chrome.runtime.getURL('index.html?embedded=1');
  frame.style.cssText =
    'position:fixed!important;inset:0!important;width:100%!important;height:100%!important;border:0!important;z-index:2147483646!important;background:white!important;color-scheme:light!important;';
  document.documentElement.append(frame);

  const host = document.createElement('div');
  host.id = 'paper-lantern-toggle';
  host.style.cssText =
    'all:initial!important;position:fixed!important;left:18px!important;bottom:18px!important;z-index:2147483647!important;display:block!important;';
  const root = host.attachShadow({ mode: 'open' });
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', 'Paper Lantern 리더');
  button.style.cssText =
    'all:initial;box-sizing:border-box;display:block;width:46px;height:28px;padding:3px;border:1px solid #ffffffaa;border-radius:20px;cursor:pointer;box-shadow:0 2px 8px #0004;';
  const knob = document.createElement('span');
  knob.setAttribute('aria-hidden', 'true');
  knob.style.cssText =
    'display:block;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0003;';
  button.append(knob);
  root.append(button);
  document.documentElement.append(host);
  let enabled = true;
  function update() {
    // Visibility keeps the iframe mounted and its layout unchanged, preserving
    // zoom, scroll and in-memory translations while the native PDF is visible.
    frame.style.setProperty('visibility', enabled ? 'visible' : 'hidden', 'important');
    frame.setAttribute('aria-hidden', String(!enabled));
    button.setAttribute('aria-checked', String(enabled));
    button.title = enabled
      ? 'Paper Lantern 켜짐 · 클릭하면 Chrome PDF 리더'
      : 'Paper Lantern 꺼짐 · 클릭하면 번역 리더';
    button.style.background = enabled ? '#42454c' : '#777';
    knob.style.transform = enabled ? 'translateX(18px)' : 'translateX(0)';
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    update();
  });
  button.addEventListener('focus', () => {
    button.style.outline = '3px solid #91a8c8';
    button.style.outlineOffset = '3px';
  });
  button.addEventListener('blur', () => {
    button.style.outline = '';
  });
  update();
})();
