(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  const guide = window.CONTINUITY_GUIDE;
  const status = byId('load-status');
  const hasStages = (profile) => profile && Array.isArray(profile.stages) && profile.stages.length > 0;
  const profiles = Array.isArray(guide?.profiles) ? guide.profiles.filter(hasStages) : [];
  if (!profiles.length && hasStages(guide)) {
    profiles.push({ ...guide, id: 'legacy', label: guide.title });
  }
  if (!profiles.length) {
    status.textContent = 'The local guide data is unavailable. Keep index.html, style.css, app.js, data.js and the evidence folder together, then reopen index.html.';
    return;
  }

  // Only plain relative evidence paths are links. Encoded paths, traversals,
  // absolute URLs and URL query/fragment syntax are deliberately excluded.
  const safeEvidencePath = (path) => {
    if (typeof path !== 'string' || !path.startsWith('evidence/')) return false;
    const parts = path.split('/');
    return parts.length > 1 && parts.every((part) =>
      part !== '.' && part !== '..' && /^[A-Za-z0-9_.-]+$/.test(part));
  };
  const appendMeta = (list, label, value, monospace = false) => {
    list.append(make('dt', label));
    const detail = make('dd');
    detail.append(make(monospace ? 'code' : 'span', value));
    list.append(detail);
  };

  let activeProfile;
  let selected = 0;
  let buttons = [];
  const selector = byId('walkthrough-select');
  profiles.forEach((profile, index) => {
    const option = make('option', profile.label);
    option.value = String(index);
    selector.append(option);
  });
  byId('walkthrough-control').hidden = profiles.length < 2;

  function showProfile(index) {
    activeProfile = profiles[index];
    selector.value = String(index);
    byId('guide-title').textContent = activeProfile.title;
    byId('guide-subtitle').textContent = activeProfile.subtitle;
    byId('generated-at').textContent = `Guide assembled: ${activeProfile.generatedAt}`;
    byId('active-walkthrough').textContent = `Selected walkthrough: ${activeProfile.label}`;
    document.title = `${activeProfile.title} · Continuity`;
    byId('stage-list').replaceChildren();
    buttons = activeProfile.stages.map((stage, index) => {
      const item = make('li');
      const button = make('button', undefined, 'stage-button');
      button.type = 'button';
      button.setAttribute('aria-controls', 'stage-panel');
      const number = make('span', String(index + 1).padStart(2, '0'), 'stage-number');
      number.setAttribute('aria-hidden', 'true');
      button.append(number, make('span', stage.label));
      button.addEventListener('click', () => showStage(index, true));
      item.append(button);
      byId('stage-list').append(item);
      return button;
    });
    showStage(0);
  }

  function showStage(index, focusTitle = false) {
    selected = index;
    const stage = activeProfile.stages[index];
    buttons.forEach((button, position) => {
      if (position === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    byId('stage-position').textContent = `Stage ${index + 1} of ${activeProfile.stages.length}`;
    for (const [id, key] of Object.entries({
      'stage-title': 'title', demonstration: 'demonstration',
      'operator-task': 'operatorTask', observed: 'observed', meaning: 'meaning', boundary: 'boundary'
    })) byId(id).textContent = stage[key];

    byId('facts').replaceChildren();
    byId('facts-section').hidden = !stage.facts?.length;
    for (const fact of stage.facts || []) {
      const row = make('tr');
      const label = make('th', fact.label);
      label.scope = 'row';
      row.append(label, make('td', fact.value));
      byId('facts').append(row);
    }

    byId('evidence').replaceChildren();
    for (const evidence of stage.evidence || []) {
      const item = make('li');
      if (safeEvidencePath(evidence.path)) {
        const link = make('a', evidence.label);
        link.href = evidence.path;
        item.append(link);
      } else item.append(make('span', `${evidence.label} — local link unavailable`));
      const details = make('details');
      details.append(make('summary', 'File identity · SHA-256 and size'));
      const metadata = make('dl', undefined, 'file-meta');
      appendMeta(metadata, 'Relative file', evidence.path, true);
      appendMeta(metadata, 'SHA-256', evidence.sha256, true);
      appendMeta(metadata, 'Bytes', evidence.bytes);
      details.append(metadata);
      item.append(details);
      byId('evidence').append(item);
    }
    if (!stage.evidence?.length) byId('evidence').append(make('li', 'No retained file is linked for this stage.'));

    byId('commands').replaceChildren();
    byId('commands-section').hidden = !stage.commands?.length;
    for (const command of stage.commands || []) {
      const details = make('details');
      details.append(make('summary', command.label));
      const pre = make('pre');
      pre.append(make('code', command.command));
      details.append(pre);
      byId('commands').append(details);
    }
    byId('previous').disabled = index === 0;
    byId('next').disabled = index === activeProfile.stages.length - 1;
    if (focusTitle) byId('stage-title').focus();
  }

  byId('previous').addEventListener('click', () => {
    if (selected > 0) showStage(selected - 1, true);
  });
  byId('next').addEventListener('click', () => {
    if (selected < activeProfile.stages.length - 1) showStage(selected + 1, true);
  });
  selector.addEventListener('change', () => showProfile(Number(selector.value)));
  const defaultIndex = profiles.findIndex((profile) => profile.id === (guide.defaultProfileId || 'native'));
  showProfile(defaultIndex < 0 ? 0 : defaultIndex);
  byId('guide-layout').hidden = false;
  status.hidden = true;
})();
