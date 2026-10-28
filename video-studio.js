(() => {
  const byId = id => document.getElementById(id);
  const title = byId('clipTitle');
  const passage = byId('clipPassage');
  const prompt = byId('clipPrompt');
  const model = byId('clipModel');
  const ratio = byId('clipRatio');
  const duration = byId('clipDuration');
  const estimate = byId('estimateAmount');
  const consent = byId('confirmCharge');
  const button = byId('createVideo');
  const status = byId('generationStatus');
  const connection = byId('connectionState');
  const result = byId('result');
  const preview = byId('videoPreview');
  const download = byId('downloadVideo');
  const resultTitle = byId('resultTitle');
  if (!button) return;

  let configured = false;
  let busy = false;
  let currentTask = null;

  function cost() {
    const rate = Number(model.selectedOptions[0]?.dataset.rate || 5);
    const credits = rate * Number(duration.value);
    return { credits, dollars:(credits * 0.01).toFixed(2) };
  }
  function updateEstimate() {
    const value = cost();
    estimate.textContent = value.credits + ' credits · about $' + value.dollars;
    button.disabled = !configured || !consent.checked || busy || prompt.value.trim().length < 12;
  }
  function setStatus(message, kind = '') {
    status.textContent = message;
    status.dataset.state = kind;
  }
  function revealVideo(job) {
    currentTask = job.id;
    try { localStorage.setItem('dw-prince-oscar-video-task', job.id); }
    catch { setStatus('Clip generated, but this browser could not remember the task. Download the MP4 to keep it.', 'error'); }
    result.hidden = false;
    resultTitle.textContent = job.title || title.value.trim() || 'Generated Bible clip';
    const url = '/api/videos/' + encodeURIComponent(job.id) + '/file';
    preview.src = url;
    download.href = url + '?download=1';
    download.download = (title.value.trim() || 'prince-oscar-bible-video').replace(/[^a-z0-9-]+/gi, '-') + '.mp4';
    setStatus('Clip generated. Loading the MP4 saved on this computer.', 'success');
    result.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  async function checkTask(taskId) {
    const response = await fetch('/api/videos/' + encodeURIComponent(taskId), { cache:'no-store' });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Could not check this video task.');
    if (job.status === 'SUCCEEDED') { revealVideo(job); busy = false; updateEstimate(); return; }
    if (job.status === 'FAILED' || job.status === 'CANCELLED') {
      busy = false; updateEstimate(); setStatus('The video could not be generated. ' + (job.failure || 'Try a simpler visual prompt.'), 'error'); return;
    }
    setStatus('Prince Oscar is rendering your clip… status: ' + String(job.status || 'processing').toLowerCase() + '. Checking again in five seconds.');
    setTimeout(() => checkTask(taskId).catch(error => { busy = false; updateEstimate(); setStatus(error.message, 'error'); }), 5000);
  }
  async function loadStatus() {
    try {
      const response = await fetch('/api/config', { cache:'no-store' });
      const info = await response.json();
      configured = !!info.configured;
      connection.textContent = configured ? 'RUNWAY CONNECTED · LOCAL ONLY' : 'RUNWAY KEY REQUIRED';
      connection.dataset.state = configured ? 'ready' : 'missing';
      if (configured) setStatus('Runway is configured. Review the estimate, approve the charge, then generate.');
      else setStatus('To enable video generation, add your Runway API key to this computer’s .env file and restart the local studio.', 'error');
      updateEstimate();
      const savedTask = localStorage.getItem('dw-prince-oscar-video-task');
      if (configured && savedTask) {
        busy = true; updateEstimate(); setStatus('Checking your latest local video task…');
        await checkTask(savedTask);
      }
    } catch (error) {
      configured = false;
      connection.textContent = 'START THE LOCAL STUDIO SERVER';
      connection.dataset.state = 'missing';
      setStatus('The local studio could not be reached (' + error.message + '). Start it with start-video-studio.cmd, then reopen this page from http://127.0.0.1:4173/video-studio.html.', 'error');
      updateEstimate();
    }
  }

  async function generate() {
    if (!configured || !consent.checked || busy) return;
    const quote = cost();
    busy = true; updateEstimate();
    result.hidden = true;
    setStatus('Sending the approved prompt to Runway…');
    try {
      const response = await fetch('/api/videos', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          title:title.value.trim() || 'Prince Oscar Bible video',
          passage:passage.value.trim(), prompt:prompt.value.trim(),
          model:model.value, ratio:ratio.value, duration:Number(duration.value),
          expectedCredits:quote.credits, confirmCharge:true
        })
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'The video request failed.');
      currentTask = job.id;
      localStorage.setItem('dw-prince-oscar-video-task', job.id);
      setStatus('Generation started · estimated ' + quote.credits + ' credits ($' + quote.dollars + '). Runway may take a few minutes.');
      setTimeout(() => checkTask(job.id).catch(error => { busy = false; updateEstimate(); setStatus(error.message, 'error'); }), 5000);
    } catch (error) {
      busy = false; updateEstimate(); setStatus(error.message, 'error');
    }
  }

  for (const control of [model, duration]) control.addEventListener('change', () => { consent.checked = false; updateEstimate(); });
  prompt.addEventListener('input', updateEstimate);
  consent.addEventListener('change', updateEstimate);
  button.addEventListener('click', generate);
  preview.addEventListener('error', () => setStatus('The video preview could not load. Use Download MP4 or try the generation again.', 'error'));
  preview.addEventListener('loadeddata', () => setStatus('Your video is ready and saved in generated-videos on this computer.', 'success'));
  updateEstimate();
  loadStatus();
})();
