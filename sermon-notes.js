(() => {
  const core = window.DailyWordSermons;
  const form = document.querySelector('#sermonForm');
  if (!core || !form) return;

  const fields = ['title', 'speaker', 'date', 'reference', 'insight', 'notes', 'application'];
  const list = document.querySelector('#sermonList');
  const search = document.querySelector('#sermonSearch');
  const status = document.querySelector('#sermonStatus');
  const idField = document.querySelector('#sermonId');
  const today = new Date();
  form.elements.date.value = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function entries() { return core.read(localStorage); }
  function announce(message, error = false) {
    status.textContent = message;
    status.dataset.state = error ? 'error' : 'success';
  }
  function escapeText(text) {
    const node = document.createElement('span');
    node.textContent = text;
    return node.innerHTML;
  }
  function resetForm() {
    form.reset();
    idField.value = '';
    form.elements.date.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    document.querySelector('#sermonSave').textContent = 'Save sermon notes';
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const items = entries().filter(item => !query || [
      item.title, item.speaker, item.reference, item.insight, item.notes, item.application
    ].join(' ').toLocaleLowerCase().includes(query));
    document.querySelector('#sermonCount').textContent = items.length + (items.length === 1 ? ' ENTRY' : ' ENTRIES');
    list.innerHTML = items.length ? items.map(item => `<article class="sermon-entry">
      <div class="sermon-entry-head"><div><span class="eyebrow">${escapeText(item.date)}${item.speaker ? ' · ' + escapeText(item.speaker) : ''}</span><h3>${escapeText(item.title)}</h3></div>
      <div class="sermon-actions"><button type="button" data-edit="${escapeText(item.id)}">Edit</button><button type="button" data-delete="${escapeText(item.id)}">Delete</button></div></div>
      ${item.reference ? `<p class="sermon-reference">${escapeText(item.reference)}</p>` : ''}
      ${item.insight ? `<p><b>Key insight</b><br>${escapeText(item.insight)}</p>` : ''}
      ${item.notes ? `<p><b>Notes</b><br>${escapeText(item.notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${item.application ? `<p><b>Response</b><br>${escapeText(item.application).replace(/\n/g, '<br>')}</p>` : ''}
    </article>`).join('') : '<p class="sermon-empty">No notes match yet. Capture a message and one thought you want to carry with you.</p>';
    list.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => edit(button.dataset.edit)));
    list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => erase(button.dataset.delete)));
  }
  function edit(id) {
    const item = entries().find(entry => entry.id === id);
    if (!item) return;
    fields.forEach(name => { form.elements[name].value = item[name]; });
    idField.value = item.id;
    document.querySelector('#sermonSave').textContent = 'Update sermon notes';
    form.scrollIntoView({ behavior:'smooth', block:'start' });
    form.elements.title.focus({ preventScroll:true });
  }
  function erase(id) {
    if (!window.confirm('Delete these sermon notes from this device?')) return;
    try { core.remove(localStorage, id); render(); announce('Sermon notes deleted from this device.'); }
    catch (error) { announce(error.message, true); }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const entry = Object.fromEntries(fields.map(name => [name, form.elements[name].value]));
    entry.id = idField.value || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    entry.updatedAt = new Date().toISOString();
    try {
      core.save(localStorage, entry);
      resetForm();
      render();
      announce('Sermon notes saved on this device.');
    } catch (error) { announce(error.message, true); }
  });
  document.querySelector('#sermonCancel').addEventListener('click', resetForm);
  search.addEventListener('input', render);
  document.querySelector('#sermonExport').addEventListener('click', () => {
    try {
      const text = entries().map(item => [
        item.title, item.date + (item.speaker ? ' · ' + item.speaker : ''),
        item.reference && 'Scripture: ' + item.reference,
        item.insight && 'Key insight:\n' + item.insight,
        item.notes && 'Notes:\n' + item.notes,
        item.application && 'Response:\n' + item.application
      ].filter(Boolean).join('\n\n')).join('\n\n' + '—'.repeat(30) + '\n\n');
      const url = URL.createObjectURL(new Blob([text], { type:'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'daily-word-sermon-notes.txt';
      link.click();
      URL.revokeObjectURL(url);
      announce('Sermon notebook exported.');
    } catch (error) { announce(error.message, true); }
  });
  render();
})();
