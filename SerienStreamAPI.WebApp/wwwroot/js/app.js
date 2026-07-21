document.addEventListener('DOMContentLoaded', () => {
    // State
    let config = {
        hostUrl: 'https://aniworld.to/',
        site: 'anime',
        ignoreCertificateValidation: false
    };

    let currentSeries = null;
    let currentSeason = 1;
    let currentEpisode = null;
    let hlsInstance = null;

    // DOM Elements
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const quickChipsWrapper = document.getElementById('quickChipsWrapper');

    const ANIME_SUGGESTIONS = [
        'Solo Leveling',
        'One Piece',
        'Demon Slayer',
        'Attack on Titan',
        'Jujutsu Kaisen',
        'My Dress-Up Darling',
        'Naruto Shippuden'
    ];

    const SERIES_SUGGESTIONS = [
        'Breaking Bad',
        'Game of Thrones',
        'Stranger Things',
        'The Walking Dead',
        'House of the Dragon',
        'Prison Break',
        'Suits'
    ];
    
    const loadingState = document.getElementById('loadingState');
    const loadingText = document.getElementById('loadingText');
    const errorBanner = document.getElementById('errorBanner');
    const errorMessage = document.getElementById('errorMessage');

    const seriesCard = document.getElementById('seriesCard');
    const bannerBackdrop = document.getElementById('bannerBackdrop');
    const seriesTitle = document.getElementById('seriesTitle');
    const seriesYear = document.getElementById('seriesYear');
    const seriesAgeRating = document.getElementById('seriesAgeRating');
    const seriesRatings = document.getElementById('seriesRatings');
    const imdbLink = document.getElementById('imdbLink');
    const genreList = document.getElementById('genreList');
    const seriesDescription = document.getElementById('seriesDescription');

    const directorsRow = document.getElementById('directorsRow');
    const directorsList = document.getElementById('directorsList');
    const actorsRow = document.getElementById('actorsRow');
    const actorsList = document.getElementById('actorsList');
    const creatorsRow = document.getElementById('creatorsRow');
    const creatorsList = document.getElementById('creatorsList');

    const seasonTabs = document.getElementById('seasonTabs');
    const episodesTitle = document.getElementById('episodesTitle');
    const episodesCount = document.getElementById('episodesCount');
    const episodesGrid = document.getElementById('episodesGrid');

    // Modals & Settings
    const activeHostUrl = document.getElementById('activeHostUrl');
    const currentSiteBadge = document.getElementById('currentSiteBadge');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const urlIndicator = document.getElementById('urlIndicator');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    const settingsForm = document.getElementById('settingsForm');
    const hostUrlInput = document.getElementById('hostUrlInput');
    const siteSelect = document.getElementById('siteSelect');
    const ignoreCertCheckbox = document.getElementById('ignoreCertCheckbox');
    const passwordHashInput = document.getElementById('passwordHashInput');
    const generateHashBtn = document.getElementById('generateHashBtn');

    // Auth & Login Gate Elements
    const loginGateOverlay = document.getElementById('loginGateOverlay');
    const loginGateForm = document.getElementById('loginGateForm');
    const gatePasswordInput = document.getElementById('gatePasswordInput');
    const toggleGatePasswordBtn = document.getElementById('toggleGatePasswordBtn');
    const gatePasswordEyeIcon = document.getElementById('gatePasswordEyeIcon');
    const gateLoginError = document.getElementById('gateLoginError');
    const gateLoginErrorMsg = document.getElementById('gateLoginErrorMsg');
    const logoutBtn = document.getElementById('logoutBtn');

    // Video Modal
    const videoModal = document.getElementById('videoModal');
    const closeVideoModalBtn = document.getElementById('closeVideoModalBtn');
    const modalEpisodeTitle = document.getElementById('modalEpisodeTitle');
    const modalEpisodeSubtitle = document.getElementById('modalEpisodeSubtitle');
    const modalEpisodeDescription = document.getElementById('modalEpisodeDescription');
    const videoModalLoading = document.getElementById('videoModalLoading');
    const videoModalContent = document.getElementById('videoModalContent');
    const streamsList = document.getElementById('streamsList');
    const extractedStreamBox = document.getElementById('extractedStreamBox');
    const copyStreamUrlBtn = document.getElementById('copyStreamUrlBtn');
    const videoPlayer = document.getElementById('videoPlayer');
    const streamUrlDisplay = document.getElementById('streamUrlDisplay');

    // Initialize Config
    fetchConfig();

    // Search Autocomplete & Search Results
    const searchDropdown = document.getElementById('searchDropdown');
    const searchResultsSection = document.getElementById('searchResultsSection');
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    const searchResultsCount = document.getElementById('searchResultsCount');
    const closeSearchResultsBtn = document.getElementById('closeSearchResultsBtn');

    let searchDebounceTimer = null;

    if (closeSearchResultsBtn) {
        closeSearchResultsBtn.addEventListener('click', () => {
            searchResultsSection.classList.add('hidden');
        });
    }

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(searchDebounceTimer);

        if (query.length < 2) {
            hideSearchDropdown();
            return;
        }

        searchDebounceTimer = setTimeout(() => {
            fetchLiveSearch(query);
        }, 250);
    });

    document.addEventListener('click', (e) => {
        if (searchForm && !searchForm.contains(e.target)) {
            hideSearchDropdown();
        }
    });

    async function fetchLiveSearch(query) {
        try {
            const res = await fetch(`/api/search?keyword=${encodeURIComponent(query)}`);
            if (!res.ok) {
                hideSearchDropdown();
                return;
            }

            const results = await res.json();
            if (results && results.length > 0) {
                renderSearchDropdown(results);
            } else {
                hideSearchDropdown();
            }
        } catch (err) {
            console.error("Live search error:", err);
            hideSearchDropdown();
        }
    }

    function stripHtmlTags(str) {
        if (!str) return '';
        return str.replace(/<[^>]*>/g, '').replace(/&#\d+;/g, match => {
            const code = parseInt(match.replace(/[&#;]/g, ''), 10);
            return String.fromCharCode(code);
        });
    }

    function renderSearchDropdown(items) {
        if (!searchDropdown) return;
        searchDropdown.innerHTML = '';
        items.slice(0, 6).forEach(item => {
            const cleanTitle = stripHtmlTags(item.title);
            const cleanDesc = stripHtmlTags(item.description);
            const div = document.createElement('div');
            div.className = 'search-dropdown-item';
            div.innerHTML = `
                <div class="search-dropdown-title">${escapeHtml(cleanTitle)}</div>
                ${cleanDesc ? `<div class="search-dropdown-desc">${escapeHtml(cleanDesc)}</div>` : ''}
            `;
            div.addEventListener('click', () => {
                hideSearchDropdown();
                if (searchResultsSection) searchResultsSection.classList.add('hidden');
                searchInput.value = cleanTitle;
                searchSeries(cleanTitle);
            });
            searchDropdown.appendChild(div);
        });
        searchDropdown.classList.remove('hidden');
    }

    function hideSearchDropdown() {
        if (searchDropdown) searchDropdown.classList.add('hidden');
    }

    function renderSearchResultsGrid(results, query) {
        if (!searchResultsSection || !searchResultsGrid) return;
        searchResultsCount.textContent = results.length;
        searchResultsGrid.innerHTML = '';

        results.forEach(item => {
            const cleanTitle = stripHtmlTags(item.title);
            const cleanDesc = stripHtmlTags(item.description);
            const card = document.createElement('div');
            card.className = 'search-result-card';
            card.innerHTML = `
                <div>
                    <div class="search-result-title">${escapeHtml(cleanTitle)}</div>
                    ${cleanDesc ? `<div class="search-result-desc">${escapeHtml(cleanDesc)}</div>` : ''}
                </div>
                <div class="search-result-action">
                    <span>Öffnen</span> <i class="fa-solid fa-arrow-right"></i>
                </div>
            `;
            card.addEventListener('click', () => {
                searchResultsSection.classList.add('hidden');
                searchInput.value = cleanTitle;
                searchSeries(cleanTitle);
            });
            searchResultsGrid.appendChild(card);
        });

        searchResultsSection.classList.remove('hidden');
        searchResultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    function clearPreviousView() {
        if (seriesCard) seriesCard.classList.add('hidden');
        if (episodesSection) episodesSection.classList.add('hidden');
        if (searchResultsSection) searchResultsSection.classList.add('hidden');
        currentSeries = null;
    }

    async function performSearch(query) {
        if (!query) return;
        clearPreviousView();
        hideSearchDropdown();
        showLoading(`Suche nach "${query}"...`);
        try {
            const res = await fetch(`/api/search?keyword=${encodeURIComponent(query)}`);
            if (res.ok) {
                const results = await res.json();
                if (results && results.length > 1) {
                    hideLoading();
                    renderSearchResultsGrid(results, query);
                    return;
                } else if (results && results.length === 1) {
                    const cleanTitle = stripHtmlTags(results[0].title);
                    searchInput.value = cleanTitle;
                    await searchSeries(cleanTitle);
                    return;
                }
            }
            await searchSeries(query);
        } catch (err) {
            await searchSeries(query);
        }
    }

    // Search Form Handlers
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        await performSearch(query);
    });

    // Quick URL Preset Elements
    const addQuickBtnCheckbox = document.getElementById('addQuickBtnCheckbox');
    const customQuickButtonsContainer = document.getElementById('customQuickButtons');
    const presetButtonsWrapper = document.getElementById('presetButtonsWrapper');

    function loadCustomPresets() {
        try {
            return JSON.parse(localStorage.getItem('saved_quick_presets') || '[]');
        } catch {
            return [];
        }
    }

    function saveCustomPresets(presets) {
        localStorage.setItem('saved_quick_presets', JSON.stringify(presets));
    }

    function renderCustomPresets() {
        if (!customQuickButtonsContainer) return;
        customQuickButtonsContainer.innerHTML = '';
        const presets = loadCustomPresets();

        presets.forEach((p, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-preset-chip';
            btn.dataset.url = p.url;
            btn.dataset.site = p.site;
            btn.title = `Zu ${p.label || p.url} wechseln`;
            
            const domainName = p.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            btn.innerHTML = `
                <i class="fa-solid fa-bookmark"></i> ${escapeHtml(p.label || domainName)}
                <i class="fa-solid fa-xmark btn-preset-remove" title="Dieser Schnell-Button löschen"></i>
            `;

            btn.querySelector('.btn-preset-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                const currentPresets = loadCustomPresets();
                currentPresets.splice(index, 1);
                saveCustomPresets(currentPresets);
                renderCustomPresets();
            });

            btn.addEventListener('click', () => applyPreset(p.url, p.site, btn));
            customQuickButtonsContainer.appendChild(btn);
        });
    }

    function applyPreset(url, site, btnElem) {
        if (hostUrlInput) hostUrlInput.value = url;
        if (siteSelect && site) siteSelect.value = site;

        if (presetButtonsWrapper) {
            presetButtonsWrapper.querySelectorAll('.btn-preset-chip').forEach(b => b.classList.remove('active'));
        }
        if (btnElem) btnElem.classList.add('active');
    }

    if (presetButtonsWrapper) {
        presetButtonsWrapper.querySelectorAll('.btn-preset-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                const site = btn.dataset.site || 'anime';
                applyPreset(url, site, btn);
            });
        });
    }

    renderCustomPresets();

    // Settings Modal Handlers
    openSettingsBtn.addEventListener('click', openSettings);
    urlIndicator.addEventListener('click', openSettings);
    closeSettingsModalBtn.addEventListener('click', closeSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);

    if (generateHashBtn) {
        generateHashBtn.addEventListener('click', async () => {
            const pwd = prompt("Bitte gib das Passwort ein, das in einen SHA-256 Hash umgewandelt werden soll:");
            if (pwd) {
                const hash = await sha256Hex(pwd);
                if (passwordHashInput) passwordHashInput.value = hash;
                alert(`Passwort erfolgreich umgewandelt!\n\nPasswort: ${pwd}\nSHA-256 Hash:\n${hash}\n\nKlicke jetzt unten auf 'Einstellungen Speichern'.`);
            }
        });
    }

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const urlValue = hostUrlInput.value.trim();
        const siteValue = siteSelect.value;

        // Check if user wants to save this URL as a quick button
        if (addQuickBtnCheckbox && addQuickBtnCheckbox.checked && urlValue) {
            const presets = loadCustomPresets();
            if (!presets.some(p => p.url === urlValue)) {
                const domainName = urlValue.replace(/^https?:\/\//, '').replace(/\/$/, '');
                presets.push({ url: urlValue, site: siteValue, label: domainName });
                saveCustomPresets(presets);
                renderCustomPresets();
            }
            addQuickBtnCheckbox.checked = false;
        }

        const updatedConfig = {
            hostUrl: urlValue,
            site: siteValue,
            ignoreCertificateValidation: ignoreCertCheckbox.checked,
            passwordHashSHA256: passwordHashInput ? passwordHashInput.value.trim() : ''
        };
        await saveConfig(updatedConfig);
        closeSettings();
        checkAuthStatus();
        if (currentSeries) {
            searchSeries(currentSeries.title);
        }
    });

    closeVideoModalBtn.addEventListener('click', closeVideoModal);

    copyStreamUrlBtn.addEventListener('click', () => {
        const url = streamUrlDisplay.textContent;
        if (url) {
            navigator.clipboard.writeText(url);
            copyStreamUrlBtn.innerHTML = '<i class="fa-solid fa-check"></i> Kopiert!';
            setTimeout(() => {
                copyStreamUrlBtn.innerHTML = '<i class="fa-regular fa-copy"></i> URL Kopieren';
            }, 2000);
        }
    });

    // Auth & Login Gate Handling
    async function sha256Hex(str) {
        if (!str) return '';
        const msgBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function checkAuthStatus() {
        try {
            const res = await fetch('/api/auth/status');
            const data = await res.json();

            if (data.isProtected) {
                const savedToken = sessionStorage.getItem('ss_auth_token');
                if (savedToken) {
                    const verifyRes = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hash: savedToken })
                    });
                    if (verifyRes.ok) {
                        showMainApp();
                        return;
                    }
                }
                showLoginGate();
            } else {
                showMainApp();
                if (logoutBtn) logoutBtn.classList.add('hidden');
            }
        } catch (err) {
            console.error("Auth status error:", err);
            showMainApp();
        }
    }

    function showLoginGate() {
        if (loginGateOverlay) loginGateOverlay.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (gatePasswordInput) gatePasswordInput.focus();
    }

    function showMainApp() {
        if (loginGateOverlay) loginGateOverlay.classList.add('hidden');
        if (logoutBtn && config.passwordHashSHA256) logoutBtn.classList.remove('hidden');
    }

    if (loginGateForm) {
        loginGateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = gatePasswordInput.value;
            if (!pwd) return;

            if (gateLoginError) gateLoginError.classList.add('hidden');

            try {
                const hash = await sha256Hex(pwd);
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd, hash: hash })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    sessionStorage.setItem('ss_auth_token', hash);
                    showMainApp();
                    gatePasswordInput.value = '';
                } else {
                    if (gateLoginErrorMsg) gateLoginErrorMsg.textContent = data.error || 'Falsches Passwort!';
                    if (gateLoginError) gateLoginError.classList.remove('hidden');
                }
            } catch (err) {
                if (gateLoginErrorMsg) gateLoginErrorMsg.textContent = err.message || 'Verbindungsfehler';
                if (gateLoginError) gateLoginError.classList.remove('hidden');
            }
        });
    }

    if (toggleGatePasswordBtn && gatePasswordInput) {
        toggleGatePasswordBtn.addEventListener('click', () => {
            const currentType = gatePasswordInput.getAttribute('type');
            const newType = currentType === 'password' ? 'text' : 'password';
            gatePasswordInput.setAttribute('type', newType);
            if (gatePasswordEyeIcon) {
                gatePasswordEyeIcon.className = newType === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('ss_auth_token');
            checkAuthStatus();
        });
    }

    // API Calls
    async function fetchConfig() {
        try {
            const res = await fetch('/api/config');
            if (res.ok) {
                config = await res.json();
                updateConfigUI();
                checkAuthStatus();
            }
        } catch (err) {
            console.error("Failed to fetch config:", err);
        }
    }

    async function saveConfig(newConfig) {
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });
            if (res.ok) {
                config = await res.json();
                updateConfigUI();
            }
        } catch (err) {
            showError("Fehler beim Speichern der Einstellungen.");
        }
    }

    function renderQuickSuggestions() {
        if (!quickChipsWrapper) return;
        quickChipsWrapper.innerHTML = '';

        const isAnime = config.site === 'anime' || (config.hostUrl && config.hostUrl.includes('aniworld'));
        const suggestions = isAnime ? ANIME_SUGGESTIONS : SERIES_SUGGESTIONS;

        suggestions.forEach(title => {
            const btn = document.createElement('button');
            btn.className = 'quick-chip';
            btn.dataset.title = title;
            btn.textContent = title;
            btn.addEventListener('click', () => {
                searchInput.value = title;
                performSearch(title);
            });
            quickChipsWrapper.appendChild(btn);
        });
    }

    function updateConfigUI() {
        activeHostUrl.textContent = config.hostUrl;
        currentSiteBadge.textContent = config.site;
        hostUrlInput.value = config.hostUrl;
        siteSelect.value = config.site;
        ignoreCertCheckbox.checked = config.ignoreCertificateValidation;
        if (passwordHashInput) passwordHashInput.value = config.passwordHashSHA256 || '';
        if (logoutBtn) {
            if (config.passwordHashSHA256 && config.passwordHashSHA256.trim() !== '') {
                logoutBtn.classList.remove('hidden');
            } else {
                logoutBtn.classList.add('hidden');
            }
        }
        renderQuickSuggestions();
    }

    function openSettings() {
        updateConfigUI();
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    function closeVideoModal() {
        videoModal.classList.add('hidden');
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        videoPlayer.pause();
        videoPlayer.src = "";
    }

    // Series Search
    async function searchSeries(title) {
        hideError();
        clearPreviousView();
        showLoading(`Suche nach "${title}" auf ${config.hostUrl}...`);

        try {
            const res = await fetch(`/api/series?title=${encodeURIComponent(title)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Serie konnte nicht gefunden werden.");
            }

            currentSeries = data;
            renderSeries(data);
            await fetchConfig();
            hideLoading();
        } catch (err) {
            hideLoading();
            showError(err.message);
        }
    }

    function renderSeries(series) {
        seriesTitle.textContent = series.title;
        seriesYear.innerHTML = `<i class="fa-regular fa-calendar"></i> ${series.yearStart}` + (series.yearEnd ? ` - ${series.yearEnd}` : '');
        seriesAgeRating.innerHTML = `<i class="fa-solid fa-shield"></i> FSK ${series.ageRating ?? 'k.A.'}`;
        seriesRatings.innerHTML = `<i class="fa-solid fa-star"></i> ${series.ratingsCount ? series.ratingsCount.toLocaleString() : 0} Bewertungen`;

        if (series.bannerUrl) {
            bannerBackdrop.style.backgroundImage = `url('${series.bannerUrl}')`;
        } else {
            bannerBackdrop.style.backgroundImage = 'none';
        }

        if (series.imdbUrl) {
            imdbLink.href = series.imdbUrl;
            imdbLink.classList.remove('hidden');
        } else {
            imdbLink.classList.add('hidden');
        }

        genreList.innerHTML = (series.genres || []).map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('');
        seriesDescription.textContent = series.description || 'Keine Beschreibung verfügbar.';

        renderCastList(directorsRow, directorsList, series.directors);
        renderCastList(actorsRow, actorsList, series.actors);
        renderCastList(creatorsRow, creatorsList, series.creators);

        renderSeasonTabs(series.seasonsCount, series.hasMovies);
        seriesCard.classList.remove('hidden');

        // Load season 1 by default
        loadSeason(series.title, 1);
    }

    function renderCastList(rowElem, listElem, items) {
        if (items && items.length > 0) {
            listElem.textContent = items.join(', ');
            rowElem.classList.remove('hidden');
        } else {
            rowElem.classList.add('hidden');
        }
    }

    function renderSeasonTabs(seasonsCount, hasMovies) {
        seasonTabs.innerHTML = '';
        for (let i = 1; i <= seasonsCount; i++) {
            const btn = document.createElement('button');
            btn.className = `season-tab ${i === 1 ? 'active' : ''}`;
            btn.textContent = `Staffel ${i}`;
            btn.addEventListener('click', () => {
                setActiveTab(btn);
                loadSeason(currentSeries.title, i);
            });
            seasonTabs.appendChild(btn);
        }

        if (hasMovies) {
            const movieBtn = document.createElement('button');
            movieBtn.className = 'season-tab';
            movieBtn.textContent = 'Filme';
            movieBtn.addEventListener('click', () => {
                setActiveTab(movieBtn);
                loadMovies(currentSeries.title);
            });
            seasonTabs.appendChild(movieBtn);
        }
    }

    function setActiveTab(selectedBtn) {
        document.querySelectorAll('.season-tab').forEach(b => b.classList.remove('active'));
        selectedBtn.classList.add('active');
    }

    async function loadSeason(title, seasonNum) {
        currentSeason = seasonNum;
        episodesTitle.textContent = `Staffel ${seasonNum}`;
        episodesCount.textContent = 'Lade Episoden...';
        episodesGrid.innerHTML = '';

        try {
            const res = await fetch(`/api/episodes?title=${encodeURIComponent(title)}&season=${seasonNum}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Episoden konnten nicht geladen werden.");

            renderEpisodes(data, false);
        } catch (err) {
            episodesCount.textContent = 'Fehler beim Laden';
            episodesGrid.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
        }
    }

    async function loadMovies(title) {
        episodesTitle.textContent = 'Filme';
        episodesCount.textContent = 'Lade Filme...';
        episodesGrid.innerHTML = '';

        try {
            const res = await fetch(`/api/movies?title=${encodeURIComponent(title)}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Filme konnten nicht geladen werden.");

            renderEpisodes(data, true);
        } catch (err) {
            episodesCount.textContent = 'Fehler beim Laden';
            episodesGrid.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
        }
    }

    function renderEpisodes(episodes, isMovie) {
        episodesCount.textContent = `${episodes.length} ${isMovie ? 'Filme' : 'Episoden'}`;
        episodesGrid.innerHTML = '';

        episodes.forEach(ep => {
            const card = document.createElement('div');
            card.className = 'episode-card';
            
            const hosterChips = (ep.hosters || []).map(h => {
                const name = typeof h === 'string' ? h : (h?.name || String(h));
                return `<span class="hoster-chip">${escapeHtml(name)}</span>`;
            }).join('');

            const langChips = (ep.languages || []).map(l => {
                if (!l) return '';
                if (typeof l === 'string') return `<span class="lang-chip">${escapeHtml(l)}</span>`;
                const audio = l.audio || 'Unbekannt';
                const sub = l.subtitle ? ` (${l.subtitle})` : '';
                return `<span class="lang-chip">${escapeHtml(audio + sub)}</span>`;
            }).join('');

            card.innerHTML = `
                <div class="episode-header-row">
                    <span class="episode-number-badge">${isMovie ? 'Film' : 'Episode ' + ep.number}</span>
                </div>
                <div>
                    <div class="episode-card-title">${escapeHtml(ep.title || 'Episode ' + ep.number)}</div>
                    ${ep.originalTitle ? `<div class="episode-card-subtitle">${escapeHtml(ep.originalTitle)}</div>` : ''}
                </div>
                <div class="episode-tags">
                    ${langChips}
                    ${hosterChips}
                </div>
            `;

            card.addEventListener('click', () => openVideoModal(ep, isMovie));
            episodesGrid.appendChild(card);
        });
    }

    async function openVideoModal(ep, isMovie) {
        currentEpisode = ep;
        modalEpisodeTitle.textContent = ep.title || (isMovie ? `Film ${ep.number}` : `Episode ${ep.number}`);
        modalEpisodeSubtitle.textContent = isMovie ? 'Film' : `Staffel ${currentSeason}, Episode ${ep.number}`;
        modalEpisodeDescription.textContent = '';
        streamsList.innerHTML = '';
        extractedStreamBox.classList.add('hidden');
        
        videoModalLoading.classList.remove('hidden');
        videoModalContent.classList.add('hidden');
        videoModal.classList.remove('hidden');

        try {
            const url = `/api/video-info?title=${encodeURIComponent(currentSeries.title)}&season=${currentSeason}&episode=${ep.number}&isMovie=${isMovie}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Stream-Details konnten nicht abgerufen werden.");

            renderVideoDetails(data);
        } catch (err) {
            streamsList.innerHTML = `<div class="error-banner"><i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(err.message)}</div>`;
        } finally {
            videoModalLoading.classList.add('hidden');
            videoModalContent.classList.remove('hidden');
        }
    }

    function renderVideoDetails(details) {
        modalEpisodeDescription.textContent = details.description || 'Keine Episodenbeschreibung verfügbar.';
        streamsList.innerHTML = '';

        if (!details.streams || details.streams.length === 0) {
            streamsList.innerHTML = '<p class="text-muted">Keine Streams für diese Episode gefunden.</p>';
            return;
        }

        details.streams.forEach(st => {
            const item = document.createElement('div');
            item.className = 'stream-item';
            
            const audioLang = st.language ? (st.language.audio || 'Unbekannt') : 'Unbekannt';
            const subLang = st.language && st.language.subtitle ? ` (${st.language.subtitle})` : '';

            item.innerHTML = `
                <div class="stream-info">
                    <span class="hoster-name">${escapeHtml(st.hoster || 'Hoster')}</span>
                    <span class="stream-lang-badge"><i class="fa-solid fa-volume-high"></i> ${escapeHtml(audioLang + subLang)}</span>
                </div>
                <button class="btn btn-sm btn-primary extract-btn">
                    <i class="fa-solid fa-play"></i> Extrahieren & Abspielen
                </button>
            `;

            const btn = item.querySelector('.extract-btn');
            btn.addEventListener('click', () => extractStream(st.videoUrl, st.hoster, btn));

            streamsList.appendChild(item);
        });
    }

    async function extractStream(videoUrl, hoster, btnElem) {
        const originalText = btnElem.innerHTML;
        btnElem.disabled = true;
        btnElem.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Extrahiere...';

        try {
            const res = await fetch('/api/extract-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoUrl, hoster })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Fehler beim Extrahieren des Streams.");

            playStream(data.streamUrl);
        } catch (err) {
            alert(`Stream konnte nicht extrahiert werden: ${err.message}`);
        } finally {
            btnElem.disabled = false;
            btnElem.innerHTML = originalText;
        }
    }

    function playStream(url) {
        extractedStreamBox.classList.remove('hidden');
        streamUrlDisplay.textContent = url;

        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        if (url.includes('.m3u8') && Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(videoPlayer);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play().catch(e => console.log("Auto-play prevented", e));
            });
        } else {
            videoPlayer.src = url;
            videoPlayer.play().catch(e => console.log("Auto-play prevented", e));
        }

        extractedStreamBox.scrollIntoView({ behavior: 'smooth' });
    }

    // UI Helpers
    function showLoading(msg) {
        loadingText.textContent = msg;
        loadingState.classList.remove('hidden');
    }

    function hideLoading() {
        loadingState.classList.add('hidden');
    }

    function showError(msg) {
        errorMessage.innerHTML = `
            <div>
                <strong>${escapeHtml(msg)}</strong>
                <div style="margin-top: 0.5rem; font-size: 0.85rem; opacity: 0.9;">
                    💡 <strong>Hilfe & Tipps zur Behebung:</strong><br>
                    • <strong>Richtige Host-URL?</strong> Prüfe in den Einstellungen (⚙️ oben rechts), ob deine gewünschte Domain eingetragen ist.<br>
                    • <strong>Website-Typ wählen:</strong> Bei Animes wähle <code>anime</code> (AniWorld/AniCloud), bei Serien wähle <code>serie</code> (SerienStream).<br>
                    • <strong>Exakter Titel:</strong> Gib den Namen wie auf der Webseite ein (z.B. <em>My Dress-Up Darling</em>, <em>One Piece</em>).
                </div>
            </div>
        `;
        errorBanner.classList.remove('hidden');
    }

    function hideError() {
        errorBanner.classList.add('hidden');
    }

    function escapeHtml(str) {
        if (!str) return '';
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>"']/g, match => {
            const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return escapeMap[match];
        });
    }
});
