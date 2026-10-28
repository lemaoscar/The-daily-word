(() => {
  const reader = document.querySelector('.scripture-reader');
  const navigation = reader?.querySelector('.chapter-nav');
  const passage = document.querySelector('#biblePassage');
  if (!reader || !navigation || !passage) return;

  const controls = document.createElement('div');
  controls.className = 'chapter-nav';
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';

  const listen = document.createElement('button');
  listen.type = 'button';
  listen.className = 'tool-button';
  listen.textContent = 'Listen to this chapter';
  listen.setAttribute('aria-pressed', 'false');

  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'tool-button';
  share.textContent = 'Share this chapter';

  const status = document.createElement('p');
  status.className = 'quiet';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(listen, share, status);
  navigation.after(controls);

  let speechParts = [];
  let partIndex = 0;
  let speaking = false;
  let audioReference = '';

  function updateListenButton() {
    listen.textContent = speaking ? 'Stop reading' : 'Listen to this chapter';
    listen.setAttribute('aria-pressed', String(speaking));
  }

  function stopReading(message) {
    if (!speaking) return;
    speaking = false;
    window.speechSynthesis.cancel();
    updateListenButton();
    if (message) status.textContent = message;
  }

  function speakNextPart() {
    if (!speaking) return;
    if (partIndex >= speechParts.length) {
      speaking = false;
      updateListenButton();
      status.textContent = 'Finished reading this chapter.';
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(speechParts[partIndex++]);
    utterance.lang = 'en';
    utterance.onend = speakNextPart;
    utterance.onerror = event => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      stopReading('Your device could not read this chapter aloud. Try another voice in your device settings.');
    };
    window.speechSynthesis.speak(utterance);
  }

  function splitForSpeech(text, limit = 2200) {
    const parts = [];
    let part = '';
    for (const word of text.split(/\s+/)) {
      const next = part ? part + ' ' + word : word;
      if (part && next.length > limit) {
        parts.push(part);
        part = word;
      } else {
        part = next;
      }
    }
    if (part) parts.push(part);
    return parts;
  }

  listen.addEventListener('click', () => {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      status.textContent = 'Read aloud is not supported by this browser. Try your device’s built-in accessibility voice.';
      return;
    }
    if (speaking) {
      stopReading('Reading stopped.');
      return;
    }

    const lines = [...passage.querySelectorAll('.verse-row p')].map(line => line.textContent.trim()).filter(Boolean);
    if (!lines.length) {
      status.textContent = 'There is no passage loaded to read aloud.';
      return;
    }
    speechParts = splitForSpeech(lines.join(' '));
    partIndex = 0;
    speaking = true;
    audioReference = document.querySelector('#readerLocation')?.textContent || '';
    status.textContent = 'Reading aloud with a voice provided by your device.';
    updateListenButton();
    speakNextPart();
  });

  const readerLocation = document.querySelector('#readerLocation');
  if (readerLocation) {
    new MutationObserver(() => {
      const nextReference = readerLocation.textContent || '';
      if (speaking && nextReference !== audioReference) stopReading('Reading stopped because the passage changed.');
    }).observe(readerLocation, { childList:true });
  }
  document.querySelector('#translationSelect')?.addEventListener('change', () => {
    stopReading('Reading stopped because the Bible edition changed.');
  });
  window.addEventListener('pagehide', () => stopReading(''));

  async function shareText(text, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        status.textContent = 'Passage shared.';
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
        status.textContent = 'The share sheet could not open. You can try copying the passage instead.';
        return;
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Passage copied to the clipboard.';
        return;
      } catch (error) {
        console.error('Daily Word could not copy the passage:', error);
        status.textContent = 'Clipboard access was denied. Select and copy the passage from the reader.';
        return;
      }
    }
    status.textContent = 'Sharing is not available in this browser. Select and copy the passage from the reader.';
  }

  share.addEventListener('click', () => {
    const reference = document.querySelector('#readerLocation')?.textContent || 'Bible passage';
    const title = reference + ' · Daily Word';
    const text = [...passage.querySelectorAll('.verse-row')].map(row => {
      const verse = row.querySelector('.verse-number')?.textContent;
      const words = row.querySelector('p')?.textContent;
      return verse && words ? verse + ' ' + words : words || '';
    }).filter(Boolean).join('\n');
    if (text) shareText(title + '\n\n' + text, title);
    else status.textContent = 'There is no passage loaded to share.';
  });

  const selectionText = document.querySelector('#selectionText');
  if (selectionText) {
    const shareVerse = document.createElement('button');
    shareVerse.type = 'button';
    shareVerse.className = 'tool-button';
    shareVerse.textContent = 'Share selected verse';
    shareVerse.disabled = true;
    shareVerse.style.marginTop = '9px';
    selectionText.after(shareVerse);

    const updateVerseShare = () => {
      shareVerse.disabled = selectionText.textContent === 'Tap a verse number in the reading text to select it.';
    };
    new MutationObserver(updateVerseShare).observe(selectionText, { childList:true, characterData:true, subtree:true });
    updateVerseShare();
    shareVerse.addEventListener('click', () => {
      const reference = document.querySelector('#selectionLabel')?.textContent || 'Bible verse';
      const quote = selectionText.textContent.replace(/^“|”$/g, '');
      if (shareVerse.disabled || !quote) return;
      const title = reference + ' · Daily Word';
      shareText('“' + quote + '” — ' + reference, title);
    });
  }
})();
