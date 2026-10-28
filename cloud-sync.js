(() => {
  const configKey = 'dw-cloud-config';
  const sessionKey = 'dw-cloud-session';
  const cloudCore = window.DailyWordCloudSync;
  const configForm = document.querySelector('#cloudConfigForm');
  if (!configForm) return;

  const status = document.querySelector('#cloudStatus');
  const emailForm = document.querySelector('#cloudEmailForm');
  const configUrl = configForm.elements.projectUrl;
  const anonKey = configForm.elements.anonKey;
  const passphrase = document.querySelector('#cloudPassphrase');
  const profileForm = document.querySelector('#cloudProfileForm');
  const profileStatus = document.querySelector('#cloudProfileStatus');
  const avatarPhoto = document.querySelector('#cloudAvatar');
  const profileVideo = document.querySelector('#cloudProfileVideo');
  let avatarObjectUrl = null;
  let user = null;
  let syncBusy = false;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.state = error ? 'error' : 'success';
  }
  function loadConfig() {
    try {
      const config = JSON.parse(localStorage.getItem(configKey) || 'null');
      if (config) { configUrl.value = config.url || ''; anonKey.value = config.anonKey || ''; }
      else {
        configUrl.value = cloudCore.DEFAULT_CONFIG.url;
        anonKey.value = cloudCore.DEFAULT_CONFIG.anonKey;
        localStorage.setItem(configKey, JSON.stringify(cloudCore.DEFAULT_CONFIG));
      }
      return config;
    } catch {
      setStatus('Saved sync settings could not be read. Re-enter your project URL and public key.', true);
      return null;
    }
  }
  function config() {
    const saved = JSON.parse(localStorage.getItem(configKey) || 'null');
    if (!saved) throw new Error('Save your Supabase project URL and publishable/anon key first.');
    return cloudCore.validateConfig(saved.url, saved.anonKey);
  }
  function session() {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); }
    catch { sessionStorage.removeItem(sessionKey); return null; }
  }
  function saveSession(value) { sessionStorage.setItem(sessionKey, JSON.stringify(value)); }
  function clearSession() { sessionStorage.removeItem(sessionKey); user = null; renderAccount(); }

  async function request(path, options = {}) {
    const settings = config();
    const current = options.publicOnly ? null : options.token || session();
    const headers = { apikey:settings.anonKey, Accept:'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.headers) Object.assign(headers, options.headers);
    if (current?.access_token) headers.Authorization = 'Bearer ' + current.access_token;
    const response = await fetch(settings.url + path, {
      method:options.method || 'GET',
      headers,
      body:options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials:'omit',
      cache:'no-store',
      signal:AbortSignal.timeout(20000)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const error = new Error(typeof data?.msg === 'string' ? data.msg :
        typeof data?.message === 'string' ? data.message :
        typeof data?.error_description === 'string' ? data.error_description : 'Supabase request failed with HTTP ' + response.status + '.');
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }

  async function freshSession() {
    const stored = session();
    if (!stored?.access_token || !stored?.refresh_token) return null;
    if (Number(stored.expires_at) > Math.floor(Date.now() / 1000) + 60) return stored;
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
      method:'POST', publicOnly:true, body:{ refresh_token:stored.refresh_token }
    });
    const next = {
      access_token:refreshed.access_token,
      refresh_token:refreshed.refresh_token,
      expires_at:Number(refreshed.expires_at) || Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600)
    };
    saveSession(next);
    return next;
  }
  async function authenticatedRequest(path, options = {}) {
    const current = await freshSession();
    if (!current) throw new Error('Sign in with the email link before syncing.');
    try { return await request(path, { ...options, token:current }); }
    catch (error) {
      if (error.status !== 401) throw error;
      sessionStorage.removeItem(sessionKey);
      throw new Error('Your sign-in has expired. Request a fresh email sign-in link.');
    }
  }
  async function loadUser() {
    const current = await freshSession();
    if (!current) { user = null; renderAccount(); return; }
    user = await request('/auth/v1/user', { token:current });
    renderAccount();
  }
  function showProfileStatus(message, error = false) {
    profileStatus.textContent = message;
    profileStatus.dataset.state = error ? 'error' : 'success';
  }
  function revokeAvatar() {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = null;
    avatarPhoto.removeAttribute('src');
    avatarPhoto.hidden = true;
    profileVideo.pause();
    profileVideo.removeAttribute('src');
    profileVideo.load();
    profileVideo.hidden = true;
    document.querySelector('#cloudAvatarFallback').hidden = false;
  }
  function renderAccount() {
    document.querySelector('#cloudSignedOut').hidden = !!user;
    document.querySelector('#cloudSignedIn').hidden = !user;
    document.querySelector('#cloudUser').textContent = user?.email || '';
    const displayName = user?.user_metadata?.display_name || 'Daily Word member';
    document.querySelector('#cloudDisplayName').textContent = displayName;
    document.querySelector('#cloudProfileName').value = user?.user_metadata?.display_name || '';
    document.querySelector('#cloudProfileRegion').value = user?.user_metadata?.region || '';
    document.querySelector('#cloudProfileAbout').value = user?.user_metadata?.about || '';
    document.querySelector('#cloudProfileRegionSummary')?.remove();
    document.querySelector('#cloudProfileAboutSummary')?.remove();
    const identity = document.querySelector('.profile-identity');
    const region = user?.user_metadata?.region;
    const about = user?.user_metadata?.about;
    if (region) {
      const regionNode = document.createElement('small');
      regionNode.id = 'cloudProfileRegionSummary';
      regionNode.textContent = region;
      identity.appendChild(regionNode);
    }
    if (about) {
      const aboutNode = document.createElement('small');
      aboutNode.id = 'cloudProfileAboutSummary';
      aboutNode.textContent = about;
      identity.appendChild(aboutNode);
    }
    document.querySelector('#cloudAvatarFallback').textContent = displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase() || 'DW';
    document.querySelector('#cloudSyncNow').disabled = !user;
    document.querySelector('#cloudDelete').disabled = !user;
    if (!user?.user_metadata?.avatar_path) revokeAvatar();
    else void loadAvatar(user.user_metadata.avatar_path, user.user_metadata.avatar_type || 'image/webp');
  }
  async function loadAvatar(objectPath, mediaType) {
    try {
      if (!user?.id || typeof objectPath !== 'string' || !objectPath.startsWith(user.id + '/profile.') ||
        !['image/webp', 'video/mp4', 'video/webm', 'video/quicktime'].includes(mediaType))
        throw new Error('Profile media path or type is not valid.');
      const signed = await authenticatedRequest('/storage/v1/object/sign/daily-word-profile-photos/' +
        objectPath.split('/').map(encodeURIComponent).join('/'), {
        method:'POST', body:{ expiresIn:3600 }
      });
      if (typeof signed?.signedURL !== 'string') throw new Error('Could not create a private photo link.');
      const settings = config();
      const signedUrl = new URL(signed.signedURL, settings.url + '/storage/v1/');
      if (signedUrl.origin !== settings.url) throw new Error('The photo link came from an unexpected server.');
      const response = await fetch(signedUrl, { credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('The profile photo could not be loaded.');
      const blob = await response.blob();
      if (blob.type !== mediaType || blob.size > 50 * 1024 * 1024) throw new Error('The saved profile media is not valid.');
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = URL.createObjectURL(blob);
      if (mediaType.startsWith('video/')) {
        profileVideo.src = avatarObjectUrl;
        profileVideo.hidden = false;
        avatarPhoto.hidden = true;
      } else {
        avatarPhoto.src = avatarObjectUrl;
        avatarPhoto.hidden = false;
        profileVideo.hidden = true;
      }
      document.querySelector('#cloudAvatarFallback').hidden = true;
    } catch (error) {
      revokeAvatar();
      showProfileStatus('Profile photo could not be displayed: ' + error.message, true);
    }
  }
  async function authenticatedFetch(path, options = {}) {
    const current = await freshSession();
    if (!current) throw new Error('Sign in before updating your profile.');
    const settings = config();
    const headers = { apikey:settings.anonKey, Authorization:'Bearer ' + current.access_token };
    if (options.contentType) headers['Content-Type'] = options.contentType;
    if (options.headers) Object.assign(headers, options.headers);
    const response = await fetch(settings.url + path, {
      method:options.method || 'POST',
      headers,
      body:options.body,
      credentials:'omit',
      cache:'no-store',
      signal:AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const error = new Error(result?.message || result?.error || 'Profile request failed with HTTP ' + response.status + '.');
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  async function imageAsWebp(file) {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('Choose an image format your device can decode. SVG files are not accepted.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('This image could not be opened. Try a different image file.'); }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image resizing is not supported in this browser.');
      const scale = Math.max(512 / bitmap.width, 512 / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.drawImage(bitmap, (512 - width) / 2, (512 - height) / 2, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('The resized image could not be prepared for upload.');
      return { blob, type:'image/webp', extension:'webp' };
    } finally { bitmap.close(); }
  }
  async function saveProfile(event) {
    event.preventDefault();
    const button = document.querySelector('#cloudProfileSave');
    button.disabled = true;
    try {
      if (!user?.id) throw new Error('Sign in before saving a profile.');
      const name = document.querySelector('#cloudProfileName').value.trim();
      const region = document.querySelector('#cloudProfileRegion').value.trim();
      const about = document.querySelector('#cloudProfileAbout').value.trim();
      if (name.length > 80) throw new Error('Display name must be 80 characters or fewer.');
      if (region.length > 100 || about.length > 500) throw new Error('Check the length of your profile details and try again.');
      const photo = document.querySelector('#cloudProfilePhoto').files[0];
      let avatarPath = user.user_metadata?.avatar_path || null;
      let avatarType = user.user_metadata?.avatar_type || 'image/webp';
      if (photo) {
        let media;
        if (photo.type.startsWith('image/')) {
          showProfileStatus('Resizing your image on this device…');
          media = await imageAsWebp(photo);
        } else {
          const videoTypes = {
            'video/mp4':{ extension:'mp4', type:'video/mp4' },
            'video/webm':{ extension:'webm', type:'video/webm' },
            'video/quicktime':{ extension:'mov', type:'video/quicktime' }
          };
          media = videoTypes[photo.type];
          if (!media) throw new Error('Choose an image or an MP4, WebM, or QuickTime video.');
          if (photo.size > 50 * 1024 * 1024) throw new Error('Choose a video smaller than 50 MB.');
          media.blob = photo;
        }
        const objectPath = user.id + '/profile.' + media.extension;
        await authenticatedFetch('/storage/v1/object/daily-word-profile-photos/' + objectPath.split('/').map(encodeURIComponent).join('/'), {
          method:'POST',
          contentType:media.type,
          headers:{ 'x-upsert':'true', 'cache-control':'3600' },
          body:media.blob
        });
        avatarPath = objectPath;
        avatarType = media.type;
      }
      const updated = await authenticatedRequest('/auth/v1/user', {
        method:'PUT', body:{ data:{ display_name:name, region, about, avatar_path:avatarPath, avatar_type:avatarType } }
      });
      user = updated;
      document.querySelector('#cloudProfilePhoto').value = '';
      renderAccount();
      showProfileStatus('Your account profile was saved.');
    } catch (error) { showProfileStatus(error.message || 'The profile could not be saved.', true); }
    finally { button.disabled = false; }
  }
  async function removeProfilePhoto() {
    if (!user?.id) return;
    const button = document.querySelector('#cloudPhotoRemove');
    button.disabled = true;
    try {
      if (user.user_metadata?.avatar_path) {
        await authenticatedFetch('/storage/v1/object/remove/daily-word-profile-photos', {
          method:'POST',
          contentType:'application/json',
          body:JSON.stringify({ prefixes:[user.id + '/avatar.webp'] })
        });
      }
      user = await authenticatedRequest('/auth/v1/user', {
        method:'PUT', body:{ data:{
          display_name:user.user_metadata?.display_name || '',
          region:user.user_metadata?.region || '',
          about:user.user_metadata?.about || '',
          avatar_path:null,
          avatar_type:null
        } }
      });
      renderAccount();
      showProfileStatus('Your profile photo was removed from your Supabase project.');
    } catch (error) { showProfileStatus(error.message || 'The profile photo could not be removed.', true); }
    finally { button.disabled = false; }
  }
  async function receiveAuthCallback() {
    if (!location.hash) return;
    const params = new URLSearchParams(location.hash.slice(1));
    const error = params.get('error_description') || params.get('error');
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    const expiry = Number(params.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(params.get('expires_in') || 3600);
    history.replaceState(null, '', location.pathname + location.search);
    if (error) { setStatus('The email sign-in did not complete. Request a fresh link and try again.', true); return; }
    if (!access || !refresh || access.length > 8192 || refresh.length > 8192)
      throw new Error('The sign-in return was incomplete. Request a fresh email link and open it in this browser.');
    saveSession({ access_token:access, refresh_token:refresh, expires_at:expiry });
    setStatus('Email sign-in complete. Your private sync is ready.');
  }
  async function sendEmailLink(email) {
    const redirect = new URL('sync.html', location.href);
    redirect.hash = '';
    await request('/auth/v1/otp', {
      method:'POST',
      publicOnly:true,
      body:{ email, create_user:true, options:{ emailRedirectTo:redirect.href } }
    });
  }
  async function readVault(id) {
    const query = '/rest/v1/daily_word_vault?select=revision,payload&user_id=eq.' + encodeURIComponent(id);
    const rows = await authenticatedRequest(query);
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('Cloud data returned an unexpected response.');
    return rows[0] || null;
  }
  async function sync() {
    if (syncBusy) return;
    syncBusy = true;
    const button = document.querySelector('#cloudSyncNow');
    button.disabled = true;
    const phrase = passphrase.value;
    passphrase.value = '';
    try {
      if (!user?.id) throw new Error('Sign in before syncing.');
      if (!window.DailyWordBackup) throw new Error('Secure backup support is not available on this page.');
      if (phrase.length < 12) throw new Error('Use the same backup passphrase on every device (at least 12 characters).');
      setStatus('Encrypting and syncing your private data…');
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await readVault(user.id);
        if (remote) {
          const remoteData = await window.DailyWordBackup.decryptBackup(remote.payload, phrase);
          window.DailyWordBackup.mergeIntoStorage(localStorage, remoteData);
        }
        const encrypted = await window.DailyWordBackup.encryptBackup(localStorage, phrase);
        try {
          const result = await authenticatedRequest('/rest/v1/rpc/save_daily_word_vault', {
            method:'POST',
            body:{ p_payload:encrypted, p_expected_revision:remote ? Number(remote.revision) : null }
          });
          if (!Array.isArray(result) || !result[0] || !Number.isFinite(Number(result[0].revision)))
            throw new Error('Cloud sync did not confirm that your data was saved.');
          renderAccount();
          setStatus('Sync complete · private data encrypted before upload · revision ' + result[0].revision + '.');
          return;
        } catch (error) {
          if (error.code !== '40001' || attempt === 3) throw error.code === '40001'
            ? new Error('Another device changed your data repeatedly. Wait a moment, then sync again.')
            : error;
        }
      }
    } catch (error) {
      setStatus(error.message || 'Sync failed. Your local data remains on this device.', true);
    } finally {
      syncBusy = false;
      button.disabled = false;
    }
  }

  configForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const validated = cloudCore.validateConfig(configUrl.value.trim(), anonKey.value);
      localStorage.setItem(configKey, JSON.stringify(validated));
      configUrl.value = validated.url;
      setStatus('Supabase project settings saved on this device.');
    } catch (error) { setStatus(error.message, true); }
  });
  emailForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#cloudEmailSubmit');
    button.disabled = true;
    try {
      const address = emailForm.elements.email.value.trim();
      await sendEmailLink(address);
      setStatus('If this address is eligible, Supabase will email a sign-in link. Open it in this browser.');
    } catch (error) { setStatus(error.message, true); }
    finally { button.disabled = false; }
  });
  document.querySelector('#cloudSyncNow').addEventListener('click', sync);
  profileForm.addEventListener('submit', saveProfile);
  document.querySelector('#cloudPhotoRemove').addEventListener('click', removeProfilePhoto);
  document.querySelector('#cloudSignOut').addEventListener('click', async () => {
    try {
      const current = await freshSession();
      if (current) await request('/auth/v1/logout', { method:'POST', token:current });
      clearSession();
      revokeAvatar();
      setStatus('Signed out of cloud sync. Local data stays on this device.');
    } catch (error) {
      clearSession();
      revokeAvatar();
      setStatus('Signed out on this device. The cloud could not confirm token revocation: ' + error.message, true);
    }
  });
  document.querySelector('#cloudDelete').addEventListener('click', async () => {
    if (!user?.id || !window.confirm('Delete the encrypted Daily Word cloud copy for this account? This does not erase this device.')) return;
    try {
      const query = '/rest/v1/daily_word_vault?user_id=eq.' + encodeURIComponent(user.id);
      await authenticatedRequest(query, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
      setStatus('Encrypted cloud copy deleted. Local data on this device was not changed.');
    } catch (error) { setStatus(error.message, true); }
  });

  loadConfig();
  (async () => {
    try {
      await receiveAuthCallback();
      await loadUser();
    } catch (error) {
      clearSession();
      setStatus(error.message || 'Could not restore the cloud sign-in session.', true);
    }
  })();
})();
