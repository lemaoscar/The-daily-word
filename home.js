(() => {
  const plan = window.DW_YEAR_PLAN;
  const now = new Date();
  const year = now.getFullYear();
  const start = Date.UTC(year, 0, 1);
  const today = Date.UTC(year, now.getMonth(), now.getDate());
  const calendarDay = Math.floor((today - start) / 86400000) + 1;
  const dayCount = plan?.days || 365;
  const day = Math.min(dayCount, calendarDay);
  const entry = plan?.entries?.[day - 1];
  const readProgress = () => {
    try {
      const value = JSON.parse(localStorage.getItem('dw-plan-complete') || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const completed = readProgress();
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  setText('todayDate', 'YOUR DAILY SPACE · ' + now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' }).toUpperCase());
  setText('currentMonth', now.toLocaleDateString(undefined, { month:'long' }));
  setText('yearDay', day + ' / ' + dayCount);
  setText('journeyDay', 'DAY ' + day + ' OF ' + dayCount + ' · FLEXIBLE PACE');

  const clock = document.getElementById('localClock');
  const clockSetting = () => {
    try { return localStorage.getItem('dw-clock-format') === '24' ? '24' : '12'; }
    catch { return '12'; }
  };
  const updateClock = () => {
    if (!clock) return;
    const format = clockSetting();
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour:'numeric',
      minute:'2-digit',
      second:'2-digit',
      hour12:format === '12'
    }).format(new Date());
    clock.dateTime = new Date().toISOString();
    clock.setAttribute('aria-label', 'Local time, ' + clock.textContent + ', ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
    clock.title = 'Local time · ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  };
  updateClock();
  window.setInterval(updateClock, 1000);
  document.addEventListener('dailyword:clock-format-changed', updateClock);

  if (entry) {
    setText('focusDate', 'TODAY’S READING · DAY ' + day);
    setText('focusTitle', entry.refs.join(' · '));
    setText('focusTheme', 'This week · ' + entry.theme);
    setText('focusPrompt', entry.prompt);
    const focusLink = document.getElementById('focusStudyLink');
    const todayLink = document.getElementById('todayStudyLink');
    const destination = 'study.html?day=' + day;
    if (focusLink) focusLink.href = destination;
    if (todayLink) todayLink.href = destination;
    const references = document.getElementById('focusReferences');
    if (references) {
      for (const reference of entry.refs) {
        const link = document.createElement('a');
        link.href = 'bible.html?' + new URLSearchParams({ ref:reference });
        link.textContent = reference;
        references.appendChild(link);
      }
    }
  }

  function refreshProgress() {
    const done = Object.entries(completed).filter(([key, value]) => /^\d+$/.test(key) && Number(key) <= dayCount && Boolean(value)).length;
    let streak = 0;
    for (let cursor = completed[day] ? day : day - 1; cursor > 0 && completed[cursor]; cursor--) streak++;
    setText('homeDoneCount', String(done));
    setText('homeStreak', String(streak));
    setText('yearPercent', done + ' / ' + dayCount + ' READINGS');
    const bar = document.getElementById('yearProgress');
    const progress = document.getElementById('homeProgress');
    if (bar) bar.style.width = Math.min(100, done / dayCount * 100) + '%';
    if (progress) progress.setAttribute('aria-valuenow', String(done));
    const button = document.getElementById('homeComplete');
    const isComplete = Boolean(completed[day]);
    if (button) {
      button.setAttribute('aria-pressed', String(isComplete));
      button.textContent = isComplete ? '✓ Today’s reading is complete' : 'Mark today’s reading complete';
    }
  }

  const calendar = document.getElementById('readingCalendar');
  const calendarLabel = document.getElementById('calendarMonth');
  const previousMonth = document.getElementById('calendarPrevious');
  const nextMonth = document.getElementById('calendarNext');
  if (calendar && calendarLabel && plan?.entries?.length) {
    let visibleMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(2023, 0, 1);
    const weekdays = Array.from({ length:7 }, (_, index) => {
      const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
      return date.toLocaleDateString(undefined, { weekday:'short' });
    });

    function renderCalendar(focusDate) {
      calendar.replaceChildren();
      calendarLabel.textContent = visibleMonth.toLocaleDateString(undefined, { month:'long', year:'numeric' });

      const weekdayRow = document.createElement('div');
      weekdayRow.setAttribute('role', 'row');
      for (const weekday of weekdays) {
        const label = document.createElement('span');
        label.className = 'calendar-weekday';
        label.setAttribute('role', 'columnheader');
        label.textContent = weekday;
        weekdayRow.appendChild(label);
      }
      calendar.appendChild(weekdayRow);

      const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
      const monthLength = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
      const weekCount = Math.ceil((firstWeekday + monthLength) / 7);
      const focusedButtons = [];

      for (let week = 0; week < weekCount; week++) {
        const row = document.createElement('div');
        row.setAttribute('role', 'row');
        for (let column = 0; column < 7; column++) {
          const calendarDate = week * 7 + column - firstWeekday + 1;
          if (calendarDate < 1 || calendarDate > monthLength) {
            const emptyCell = document.createElement('span');
            emptyCell.className = 'calendar-empty';
            emptyCell.setAttribute('role', 'gridcell');
            emptyCell.setAttribute('aria-hidden', 'true');
            row.appendChild(emptyCell);
            continue;
          }

          const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), calendarDate);
          const isCurrentYear = date.getFullYear() === plan.year;
          const ordinal = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + 1;
          const planDay = Math.min(plan.days || 365, ordinal);
          const done = isCurrentYear && Boolean(completed[planDay]);
          const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
          const cell = document.createElement('div');
          cell.setAttribute('role', 'gridcell');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'calendar-day' + (done ? ' is-complete' : '');
          button.textContent = String(calendarDate);
          button.dataset.calendarDate = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
          if (isToday) button.setAttribute('aria-current', 'date');
          button.setAttribute('aria-label', date.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' }) + (isCurrentYear ? ' · reading day ' + planDay : ' · outside this year’s reading plan') + (done ? ' · complete' : ''));
          button.disabled = !isCurrentYear;
          if (isCurrentYear) {
            focusedButtons.push(button);
            button.addEventListener('click', () => {
              const hint = document.getElementById('calendarHint');
              if (hint) hint.textContent = done ? 'Revisit your completed day ' + planDay + ' reading.' : 'Opening day ' + planDay + ' of your reading plan.';
              location.href = 'study.html?day=' + planDay;
            });
          }
          cell.appendChild(button);
          row.appendChild(cell);
        }
        calendar.appendChild(row);
      }

      const monthStart = new Date(plan.year, 0, 1);
      const monthEnd = new Date(plan.year, 11, 31);
      if (previousMonth) previousMonth.disabled = visibleMonth <= new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
      if (nextMonth) nextMonth.disabled = visibleMonth >= new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);
      const focus = focusedButtons.find(button => button.dataset.calendarDate === focusDate) || focusedButtons.find(button => button.getAttribute('aria-current') === 'date') || focusedButtons[0];
      focus?.setAttribute('data-calendar-focus-target', 'true');
    }

    function changeMonth(amount) {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1);
      renderCalendar();
      calendar.querySelector('[data-calendar-focus-target]')?.focus();
    }

    previousMonth?.addEventListener('click', () => changeMonth(-1));
    nextMonth?.addEventListener('click', () => changeMonth(1));
    window.addEventListener('storage', event => {
      if (event.key !== 'dw-plan-complete') return;
      for (const key of Object.keys(completed)) delete completed[key];
      Object.assign(completed, readProgress());
      refreshProgress();
      renderCalendar();
    });
    renderCalendar();
  }

  const checkin = document.getElementById('homeComplete');
  checkin?.addEventListener('click', () => {
    const updated = readProgress();
    updated[day] = !updated[day];
    try {
      localStorage.setItem('dw-plan-complete', JSON.stringify(updated));
      for (const key of Object.keys(completed)) delete completed[key];
      Object.assign(completed, updated);
      refreshProgress();
      if (typeof say === 'function') say(updated[day] ? 'Today’s reading saved on this device.' : 'Today’s reading marked incomplete.');
    } catch {
      if (typeof say === 'function') say('Could not save your reading progress. Check this browser’s storage settings.');
    }
  });
  refreshProgress();

  const installButton = document.getElementById('installApp');
  const offlineStatus = document.getElementById('offlineStatus');
  let installPrompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
    if (offlineStatus) offlineStatus.textContent = choice.outcome === 'accepted' ? 'Daily Word is ready on your home screen.' : 'You can install Daily Word any time from your browser menu.';
  });
  window.addEventListener('appinstalled', () => {
    if (offlineStatus) offlineStatus.textContent = 'Daily Word is installed. Your reading and journal stay on this device.';
    if (installButton) installButton.hidden = true;
  });

  const localSecureContext = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !localSecureContext) {
    if (offlineStatus) offlineStatus.textContent = 'For offline app installation, open Daily Word from its local web address on this computer.';
    return;
  }
  navigator.serviceWorker.register('./service-worker.js').then(() => {
    if (offlineStatus) offlineStatus.textContent = 'Your reading and journal stay on this device. Pages you visit are saved for offline use.';
  }).catch(error => {
    console.error('Daily Word could not enable offline support:', error);
    if (offlineStatus) offlineStatus.textContent = 'Offline support could not start. You can still use Daily Word while this page is open.';
  });
})();
