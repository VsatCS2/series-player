// ============================================
// SERIES PLAYER
// ============================================

// Shared player speed/volume persistence
const PLAYER_PREFS = {
    get speed() { return parseFloat(localStorage.getItem('player_speed') || '1'); },
    set speed(v) { try { localStorage.setItem('player_speed', String(v)); } catch (e) {} },
    get volume() { return parseFloat(localStorage.getItem('player_volume') || '1'); },
    set volume(v) { try { localStorage.setItem('player_volume', String(v)); } catch (e) {} },
};

// ============================================
// HOME SCREEN CONTROLLER
// ============================================

class HomeController {
    constructor() {
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.searchError = document.getElementById('search-error');
        this.searchResults = document.getElementById('search-results');
        this.recentShows = document.getElementById('recent-shows');
        this.recentList = document.getElementById('recent-list');
        this.continueWatching = document.getElementById('continue-watching');
        this.continueList = document.getElementById('continue-list');
        this.theme = localStorage.getItem('theme') || 'dark';

        this.isLoading = false;
        this._searchDebounce = null;

        this.applyTheme();
        this.bindEvents();
        this.renderRecentShows();
        this.renderContinueWatching();

        // Handle deep-link URL params
        const urlParams = getUrlParams();
        if (urlParams.showId) {
            setTimeout(() => {
                this.startShow(urlParams.showId, urlParams.season || 1, urlParams.episode || 1);
            }, 100);
        }
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        document.body.classList.toggle('light-theme', this.theme === 'light');
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('theme', this.theme); } catch (e) {}
        this.applyTheme();
    }

    bindEvents() {
        this.searchBtn.addEventListener('click', () => this.handleSearch());
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSearch();
            } else if (e.key === 'Escape') {
                this.clearSearchResults();
            }
        });

        // Live search as user types
        this.searchInput.addEventListener('input', () => {
            clearTimeout(this._searchDebounce);
            const query = this.searchInput.value.trim();
            if (query.length < 2 || /^tt\d+$/.test(query) || /^\d+$/.test(query)) {
                this.clearSearchResults();
                return;
            }
            this._searchDebounce = setTimeout(() => this.doLiveSearch(query), 350);
        });

        document.querySelectorAll('.example-card').forEach(card => {
            card.addEventListener('click', () => {
                this.searchInput.value = card.dataset.id;
                this.handleSearch();
            });
        });

        document.getElementById('home-theme-btn')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('clear-data-btn')?.addEventListener('click', () => this.clearAllData());

        document.addEventListener('keydown', (e) => {
            if ((e.key === 't' || e.key === 'T') &&
                !document.getElementById('player-screen')?.classList.contains('active') &&
                e.target.tagName !== 'INPUT') {
                this.toggleTheme();
            }
        });
    }

    clearAllData() {
        if (!confirm('Clear all saved shows, progress, and preferences?')) return;
        clearAllAppData();
        this.renderRecentShows();
        this.renderContinueWatching();
        this.theme = 'dark';
        this.applyTheme();
    }

    async doLiveSearch(query) {
        try {
            const results = await searchShows(query);
            if (this.searchInput.value.trim() !== query) return;
            this.renderSearchResults(results);
        } catch (e) {
            // Silent — live search errors shouldn't spam
            console.warn('Live search failed:', e.message);
        }
    }

    renderSearchResults(results) {
        if (!this.searchResults) return;
        if (!results || results.length === 0) {
            this.searchResults.classList.add('hidden');
            this.searchResults.innerHTML = '';
            return;
        }
        this.searchResults.classList.remove('hidden');
        this.searchResults.innerHTML = '';
        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-result';
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            const posterHtml = item.poster
                ? `<img class="search-result-poster" src="${item.poster}" alt="${this.escapeHtml(item.title)}" loading="lazy" />`
                : `<div class="search-result-poster placeholder">🎬</div>`;
            div.innerHTML = `
                ${posterHtml}
                <div class="search-result-info">
                    <div class="search-result-title">${this.escapeHtml(item.title)}</div>
                    <div class="search-result-year">${item.year || ''}</div>
                </div>
            `;
            const activate = () => this.startShow(item.id, 1, 1);
            div.addEventListener('click', activate);
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
            });
            this.searchResults.appendChild(div);
        });
    }

    clearSearchResults() {
        if (!this.searchResults) return;
        this.searchResults.classList.add('hidden');
        this.searchResults.innerHTML = '';
    }

    async handleSearch() {
        if (this.isLoading) return;

        const input = this.searchInput.value.trim();
        if (!input) {
            this.showError('Please enter a show name, TMDB ID, or IMDB ID');
            return;
        }

        this.hideError();
        this.clearSearchResults();
        this.isLoading = true;
        this.searchBtn.disabled = true;
        this.searchBtn.textContent = 'Loading...';

        try {
            // If it's a bare number or IMDB ID, go straight to show
            const isId = /^tt\d+$/i.test(input) || /^\d+$/.test(input);
            if (isId) {
                const idType = input.startsWith('tt') ? 'imdb' : 'tmdb';
                const showData = await fetchShowData(input, idType);
                if (Object.keys(showData.episodesPerSeason).length === 0) {
                    this.showError('No episodes found for this show.');
                    return;
                }
                this.startShow(input, 1, 1);
                return;
            }

            // Otherwise treat as a name search
            const results = await searchShows(input);
            if (results.length === 0) {
                this.showError(`No shows found for "${input}"`);
                return;
            }
            if (results.length === 1) {
                this.startShow(results[0].id, 1, 1);
                return;
            }
            // Multiple results — show them
            this.renderSearchResults(results);
        } catch (error) {
            this.showError(`Search failed: ${error.message || 'Please try again'}`);
        } finally {
            this.isLoading = false;
            this.searchBtn.disabled = false;
            this.searchBtn.textContent = '▶ Watch';
        }
    }

    startShow(showId, season, episode) {
        const homeScreen = document.getElementById('home-screen');
        const playerScreen = document.getElementById('player-screen');

        homeScreen.classList.remove('active');
        homeScreen.style.display = 'none';
        playerScreen.classList.add('active');
        playerScreen.style.display = 'block';

        if (window.player) {
            try { window.player.destroy(); } catch (e) {}
            window.player = null;
        }

        const config = {
            showId,
            startSeason: season || 1,
            startEpisode: episode || 1,
            introDuration: SHOW_CONFIG.introDuration,
            outroDuration: SHOW_CONFIG.outroDuration,
            nextEpisodeDelay: SHOW_CONFIG.nextEpisodeDelay,
        };

        // Defer player init so DOM reflow completes
        requestAnimationFrame(() => {
            setTimeout(() => {
                try {
                    window.player = new SeriesPlayer(config);
                } catch (error) {
                    console.error('Failed to create player:', error);
                    this.showError('Failed to initialize player. Please try again.');
                }
            }, 50);
        });
    }

    renderContinueWatching() {
        const shows = getContinueWatching();
        if (shows.length === 0) {
            this.continueWatching.classList.add('hidden');
            return;
        }
        this.continueWatching.classList.remove('hidden');
        this.continueList.innerHTML = '';

        shows.forEach(item => {
            const div = document.createElement('div');
            div.className = 'continue-item';
            const progress = item.progress || 0;
            const total = item.duration || 1;
            const percent = Math.min((progress / total) * 100, 100);

            div.innerHTML = `
                <span class="continue-title">${this.escapeHtml(item.title)}</span>
                <div class="continue-meta">
                    <span>S${String(item.season || 1).padStart(2, '0')}E${String(item.episode || 1).padStart(2, '0')}</span>
                    <span>${Math.floor(progress / 60)}m / ${Math.floor(total / 60)}m</span>
                </div>
                <div class="continue-progress-bar">
                    <div class="continue-progress-fill" style="width: ${percent}%"></div>
                </div>
                <button class="remove-btn continue-remove" type="button" aria-label="Remove from continue watching">✕</button>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('continue-remove')) return;
                this.startShow(item.id, item.season || 1, item.episode || 1);
            });

            div.querySelector('.continue-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeContinueWatching(item.id);
                this.renderContinueWatching();
            });

            this.continueList.appendChild(div);
        });
    }

    renderRecentShows() {
        const recent = getRecentShows();
        if (recent.length === 0) {
            this.recentShows.classList.add('hidden');
            return;
        }
        this.recentShows.classList.remove('hidden');
        this.recentList.innerHTML = '';

        recent.forEach(item => {
            const div = document.createElement('div');
            div.className = 'recent-item';
            const resume = this.getResumePoint(item.id);

            div.innerHTML = `
                <span class="recent-title">${this.escapeHtml(item.title || 'Unknown Show')}</span>
                <div class="recent-meta">
                    <span>S${String(resume?.season || item.season || 1).padStart(2, '0')}E${String(resume?.episode || item.episode || 1).padStart(2, '0')}</span>
                    <span class="recent-progress">${resume ? '▶ Resume' : ''}</span>
                    <button class="remove-btn recent-remove" type="button" aria-label="Remove from recent">✕</button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('recent-remove')) return;
                const resume = this.getResumePoint(item.id);
                this.startShow(
                    item.id,
                    resume?.season || item.season || 1,
                    resume?.episode || item.episode || 1
                );
            });

            div.querySelector('.recent-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeRecentShow(item.id);
                this.renderRecentShows();
            });

            this.recentList.appendChild(div);
        });
    }

    getResumePoint(showId) {
        // Prefer the continue-watching entry (has lastWatched timestamp)
        const continueItems = getContinueWatching();
        const cw = continueItems.find(item => item.id === showId);
        if (cw && cw.progress > 30 && (cw.duration === 0 || cw.progress < cw.duration - 30)) {
            return { season: cw.season || 1, episode: cw.episode || 1 };
        }
        return null;
    }

    showError(message) {
        this.searchError.textContent = message;
        this.searchError.classList.remove('hidden');
    }

    hideError() {
        this.searchError.classList.add('hidden');
    }

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

// ============================================
// PLAYER CLASS
// ============================================

class SeriesPlayer {
    constructor(config) {
        console.log('🎮 Initializing player...', config);

        this.config = config;
        this.showId = config.showId;
        this.currentSeason = config.startSeason || 1;
        this.currentEpisode = config.startEpisode || 1;

        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.volume = PLAYER_PREFS.volume;
        this.lastVolume = this.volume || 1;
        this.muted = false;
        this.playbackSpeed = PLAYER_PREFS.speed;

        this.introSkipped = false;
        this.episodeEnded = false;
        this.isLoading = false;
        this.skipIntroClicked = false;
        this.nextEpisodeLoading = false;
        this.initialized = false;
        this.selectorUpdating = false;
        this.isFullscreen = false;
        this.pipActive = false;
        this.controlsVisible = true;
        this.controlsLocked = false;
        this.controlsTimer = null;
        this.nextEpisodeTimer = null;
        this.episodeTitles = {};
        this.showData = null;
        this._seekTimeout = null;
        this.progressCheckInterval = null;
        this.destroyed = false;
        this._lastProgressSave = 0;
        this._lastContinueSave = 0;

        // Cache DOM elements
        this.cacheDomElements();
        this.bindEvents();

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._onFullscreenChange = this._onFullscreenChange.bind(this);
        this._onVisibilityChange = this._onVisibilityChange.bind(this);
        this._onBeforeUnload = this._onBeforeUnload.bind(this);

        document.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('message', this._onMessage);
        document.addEventListener('fullscreenchange', this._onFullscreenChange);
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        window.addEventListener('beforeunload', this._onBeforeUnload);

        this.initializePlayer();
    }

    cacheDomElements() {
        const $ = id => document.getElementById(id);
        this.player = $('player');
        this.playerWrapper = $('player-wrapper');
        this.playerScreen = $('player-screen');
        this.app = $('app');
        this.playPauseBtn = $('play-pause-btn');
        this.prevEpisodeBtn = $('prev-episode-btn');
        this.nextEpisodeBtn = $('next-episode-btn');
        this.episodeCounter = $('episode-counter');
        this.showTitle = $('show-title');
        this.episodeLabel = $('episode-label');
        this.episodeTitle = $('episode-title');
        this.progressFill = $('progress-fill');
        this.progressBuffer = $('progress-buffer');
        this.progressBar = $('progress-bar');
        this.currentTimeDisplay = $('current-time');
        this.totalTimeDisplay = $('total-time');
        this.skipIntroBtn = $('skip-intro');
        this.nextOverlay = $('next-episode-overlay');
        this.nextCountdown = $('next-countdown');
        this.nextNowBtn = $('next-now-btn');
        this.fullscreenBtn = $('fullscreen-btn');
        this.pipBtn = $('pip-btn');
        this.loadingIndicator = $('loading-indicator');
        this.backBtn = $('back-btn');
        this.speedSelector = $('speed-selector');
        this.qualitySelector = $('quality-selector');
        this.themeBtn = $('theme-btn');
        this.shortcutsHelp = $('shortcuts-help');
        this.shortcutsPopup = $('shortcuts-popup');
        this.closeShortcuts = $('close-shortcuts');
        this.controlsBar = $('controls-bar');
        this.episodeInfo = $('episode-info');
        this.seasonSelect = $('season-select');
        this.episodeSelect = $('episode-select');
        this.goToEpisodeBtn = $('go-to-episode-btn');
        this.volumeSlider = $('volume-slider');
        this.muteBtn = $('mute-btn');
    }

    // ---------- Initialization ----------
    async initializePlayer() {
        try {
            this.showLoading(true);

            const idType = typeof this.showId === 'string' && this.showId.startsWith('tt') ? 'imdb' : 'tmdb';
            this.showData = await fetchShowData(this.showId, idType);

            this.config.showTitle = this.showData.title;
            this.config.episodesPerSeason = this.showData.episodesPerSeason;

            if (this.showTitle) this.showTitle.textContent = this.showData.title;
            document.title = `${this.showData.title} - Series Player`;

            this.populateSeasonSelector();
            addRecentShow(this.showId, this.showData.title, this.currentSeason, this.currentEpisode);

            // Set initial volume/speed UI
            if (this.volumeSlider) this.volumeSlider.value = String(this.volume);
            if (this.speedSelector) this.speedSelector.value = String(this.playbackSpeed);
            this.updateMuteButton();

            this.loadEpisode(this.currentSeason, this.currentEpisode, true);

            this.initialized = true;
            console.log(`✅ "${this.showData.title}" loaded successfully!`);

            // Fetch episode titles in background (non-blocking)
            if (this.showData.tmdbId) {
                const seasonNumbers = Object.keys(this.showData.episodesPerSeason).map(Number);
                fetchEpisodeTitles(this.showData.tmdbId, seasonNumbers)
                    .then(titles => {
                        if (this.destroyed) return;
                        this.episodeTitles = titles;
                        this.updateEpisodeInfo(this.currentSeason, this.currentEpisode);
                    })
                    .catch(e => console.warn('Episode titles unavailable:', e.message));
            }
        } catch (error) {
            console.error('❌ Failed to load show:', error);
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            color: #ff6b6b; text-align: center; background: rgba(0,0,0,0.92);
            padding: 28px 32px; border-radius: 10px; z-index: 50; max-width: 480px;
            border: 1px solid rgba(255,0,0,0.2);
        `;
        errorDiv.innerHTML = `
            <div style="font-size:42px;margin-bottom:14px;">❌</div>
            <div style="font-weight:600;margin-bottom:8px;font-size:16px;">Failed to load show</div>
            <div style="color:#aaa;font-size:13px;line-height:1.5;">${this.escapeHtml(message || 'Please check the ID and try again')}</div>
            <button id="error-back-btn" style="
                margin-top:18px; padding:10px 22px; background:#e50914;
                border:none; border-radius:6px; color:white; font-size:13px;
                font-weight:600; cursor:pointer;
            ">← Go Back</button>
        `;
        this.playerWrapper.appendChild(errorDiv);
        errorDiv.querySelector('#error-back-btn').addEventListener('click', () => this.goHome());
    }

    // ---------- Episode Loading ----------
    loadEpisode(season, episode, checkResume = true) {
        if (this.isLoading || this.destroyed) return;

        const totalEps = this.config.episodesPerSeason?.[season];
        if (!totalEps || episode > totalEps || episode < 1) {
            console.warn(`❌ S${season}E${episode} out of range`);
            return;
        }

        this.isLoading = true;
        this.currentSeason = season;
        this.currentEpisode = episode;
        this.episodeEnded = false;
        this.introSkipped = false;
        this.skipIntroClicked = false;
        this.nextEpisodeLoading = false;

        // Cancel any pending countdown
        clearInterval(this.nextEpisodeTimer);
        this.nextEpisodeTimer = null;

        if (!this.selectorUpdating) {
            this.selectorUpdating = true;
            if (this.seasonSelect) this.seasonSelect.value = String(season);
            this.populateEpisodeSelector(season);
            if (this.episodeSelect) this.episodeSelect.value = String(episode);
            this.selectorUpdating = false;
        }

        updateRecentShowProgress(this.showId, season, episode);

        let resumeTime = 0;
        if (checkResume) {
            const saved = localStorage.getItem(this.getStorageKey());
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (parsed > 30) {
                    if (this.duration > 0 && parsed < this.duration - 30) resumeTime = parsed;
                    else if (this.duration === 0) resumeTime = parsed;
                }
            }
        }

        const url = this.buildPlayerUrl(season, episode, resumeTime);

        try {
            this.player.src = url;
        } catch (e) {
            console.error('Failed to set player URL:', e);
            if (resumeTime > 0) {
                try { this.player.src = this.buildPlayerUrl(season, episode, 0); } catch (e2) {}
            }
        }

        this.updateEpisodeInfo(season, episode);
        this.hideSkipIntro();
        this.hideNextOverlay();
        this.resetProgress();

        if (this.episodeCounter) {
            this.episodeCounter.textContent = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        }

        console.log(`📺 Loading S${season}E${episode}${resumeTime > 0 ? ` (resume ${resumeTime}s)` : ''}`);

        // Reset loading flag after iframe has had a chance to start
        setTimeout(() => { this.isLoading = false; }, 800);
    }

    buildPlayerUrl(season, episode, resumeTime = 0) {
        let url = `https://vaplayer.ru/embed/tv/${this.showId}/${season}/${episode}`;
        const params = new URLSearchParams();
        params.set('autoplay', '1');
        params.set('controls', '1');
        params.set('rel', '0');
        params.set('showinfo', '0');
        params.set('modestbranding', '1');
        if (resumeTime > 0) params.set('resumeAt', resumeTime);
        return url + '?' + params.toString();
    }

    getStorageKey() {
        return `progress_${this.showId}_${this.currentSeason}_${this.currentEpisode}`;
    }

    getEpisodeTitle(season, episode) {
        return this.episodeTitles[`${season}_${episode}`] || '';
    }

    // ---------- UI Updates ----------
    updateEpisodeInfo(season, episode) {
        if (this.episodeLabel) this.episodeLabel.textContent = `Season ${season}, Episode ${episode}`;
        const title = this.getEpisodeTitle(season, episode);
        if (this.episodeTitle) {
            this.episodeTitle.textContent = title;
            this.episodeTitle.style.display = title ? 'block' : 'none';
        }
    }

    resetProgress() {
        if (this.progressFill) this.progressFill.style.width = '0%';
        if (this.progressBuffer) this.progressBuffer.style.width = '0%';
        if (this.currentTimeDisplay) this.currentTimeDisplay.textContent = '0:00';
        if (this.totalTimeDisplay) this.totalTimeDisplay.textContent = '0:00';
        if (this.progressBar) this.progressBar.setAttribute('aria-valuenow', '0');
    }

    showLoading(show) {
        this.loadingIndicator?.classList.toggle('active', show);
    }

    showSkipIntro() {
        if (!this.introSkipped && !this.skipIntroClicked && this.skipIntroBtn) {
            this.skipIntroBtn.classList.remove('hidden');
        }
    }

    hideSkipIntro() {
        this.skipIntroBtn?.classList.add('hidden');
    }

    showNextOverlay() {
        if (this.nextEpisodeLoading || this.episodeEnded || this.destroyed) return;
        if (this.nextOverlay?.classList.contains('hidden')) {
            this.nextOverlay.classList.remove('hidden');
        }
        let countdown = this.config.nextEpisodeDelay || 5;
        this.nextCountdown.textContent = String(countdown);
        clearInterval(this.nextEpisodeTimer);
        this.nextEpisodeTimer = setInterval(() => {
            countdown--;
            if (this.nextCountdown) this.nextCountdown.textContent = String(countdown);
            if (countdown <= 0) {
                clearInterval(this.nextEpisodeTimer);
                this.nextEpisodeTimer = null;
                this.loadNextEpisode();
            }
        }, 1000);
    }

    hideNextOverlay() {
        this.nextOverlay?.classList.add('hidden');
        clearInterval(this.nextEpisodeTimer);
        this.nextEpisodeTimer = null;
    }

    // ---------- Navigation ----------
    loadNextEpisode() {
        if (this.nextEpisodeLoading || this.destroyed) return;
        this.nextEpisodeLoading = true;
        this.hideNextOverlay();
        this.episodeEnded = false;

        const nextEpisode = this.currentEpisode + 1;
        const totalEps = this.config.episodesPerSeason?.[this.currentSeason] || 0;

        if (nextEpisode <= totalEps) {
            this.loadEpisode(this.currentSeason, nextEpisode, false);
        } else {
            this.loadNextSeason();
        }
        setTimeout(() => { this.nextEpisodeLoading = false; }, 1200);
    }

    loadPreviousEpisode() {
        if (this.destroyed) return;
        if (this.currentEpisode > 1) {
            this.loadEpisode(this.currentSeason, this.currentEpisode - 1, false);
        } else if (this.currentSeason > 1) {
            const prevSeason = this.currentSeason - 1;
            const totalEps = this.config.episodesPerSeason?.[prevSeason] || 0;
            if (totalEps > 0) this.loadEpisode(prevSeason, totalEps, false);
        }
    }

    loadNextSeason() {
        const nextSeason = this.currentSeason + 1;
        if (this.config.episodesPerSeason?.[nextSeason]) {
            this.loadEpisode(nextSeason, 1, false);
        } else {
            console.log('🎉 Series complete!');
            if (this.episodeLabel) this.episodeLabel.textContent = '🎉 Series Complete!';
            if (this.episodeTitle) this.episodeTitle.textContent = '';
            this.hideNextOverlay();
        }
    }

    goToEpisode() {
        if (this.selectorUpdating || this.destroyed) return;
        const season = parseInt(this.seasonSelect?.value || this.currentSeason, 10);
        const episode = parseInt(this.episodeSelect?.value || this.currentEpisode, 10);
        if (season !== this.currentSeason || episode !== this.currentEpisode) {
            this.hideNextOverlay();
            this.loadEpisode(season, episode, true);
        }
    }

    populateSeasonSelector() {
        if (!this.seasonSelect) return;
        const seasons = Object.keys(this.config.episodesPerSeason).map(Number).sort((a, b) => a - b);
        this.seasonSelect.innerHTML = '';
        seasons.forEach(season => {
            const opt = document.createElement('option');
            opt.value = String(season);
            opt.textContent = String(season);
            this.seasonSelect.appendChild(opt);
        });
        this.seasonSelect.value = String(this.currentSeason);
        this.populateEpisodeSelector(this.currentSeason);
    }

    populateEpisodeSelector(season) {
        if (!this.episodeSelect) return;
        const totalEps = this.config.episodesPerSeason[season] || 0;
        this.episodeSelect.innerHTML = '';
        for (let i = 1; i <= totalEps; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = String(i);
            this.episodeSelect.appendChild(opt);
        }
        this.episodeSelect.value = String(this.currentEpisode);
    }

    // ---------- Playback Controls ----------
    //
    // NOTE: Third-party embeds do NOT listen for our postMessage commands.
    // These controls attempt postMessage as a best-effort; when they fail,
    // the embed's own controls (controls=1) remain the source of truth.
    // For full control, replace the iframe with an HLS.js <video> player.
    // ----------

    togglePlay() {
        if (this.destroyed || !this.player) return;
        this.postPlayerMessage({ type: 'PLAYER_CONTROL', action: this.isPlaying ? 'pause' : 'play' });
        this.isPlaying = !this.isPlaying;
        if (this.playPauseBtn) this.playPauseBtn.textContent = this.isPlaying ? '⏸' : '▶';
        this.resetControlsTimer();
    }

    seekTo(time) {
        if (this.destroyed) return;
        if (this._seekTimeout) clearTimeout(this._seekTimeout);
        this._seekTimeout = setTimeout(() => {
            this._seekTimeout = null;
            const clamped = Math.max(0, Math.min(time, this.duration || 999999));
            this.postPlayerMessage({ type: 'PLAYER_CONTROL', action: 'seek', value: clamped });
            this.resetControlsTimer();
        }, 120);
    }

    skipIntro() {
        if (!this.introSkipped && !this.destroyed) {
            this.seekTo(this.config.introDuration);
            this.hideSkipIntro();
            this.introSkipped = true;
            this.skipIntroClicked = true;
        }
    }

    setSpeed(speed) {
        if (this.destroyed) return;
        this.playbackSpeed = parseFloat(speed);
        PLAYER_PREFS.speed = this.playbackSpeed;
        this.postPlayerMessage({ type: 'PLAYER_CONTROL', action: 'speed', value: this.playbackSpeed });
    }

    setVolume(volume) {
        if (this.destroyed) return;
        this.volume = Math.max(0, Math.min(1, parseFloat(volume)));
        if (this.volume > 0) {
            this.muted = false;
            this.lastVolume = this.volume;
        }
        PLAYER_PREFS.volume = this.volume;
        this.postPlayerMessage({ type: 'PLAYER_CONTROL', action: 'volume', value: this.volume });
        this.updateMuteButton();
        if (this.volumeSlider) this.volumeSlider.value = String(this.volume);
    }

    toggleMute() {
        if (this.destroyed) return;
        if (this.muted) {
            this.muted = false;
            this.setVolume(this.lastVolume || 1);
        } else {
            this.lastVolume = this.volume;
            this.muted = true;
            this.postPlayerMessage({ type: 'PLAYER_CONTROL', action: 'mute', value: true });
            if (this.volumeSlider) this.volumeSlider.value = '0';
        }
        this.updateMuteButton();
    }

    updateMuteButton() {
        if (!this.muteBtn) return;
        if (this.muted || this.volume === 0) this.muteBtn.textContent = '🔇';
        else if (this.volume < 0.5) this.muteBtn.textContent = '🔉';
        else this.muteBtn.textContent = '🔊';
    }

    postPlayerMessage(message) {
        try {
            this.player?.contentWindow?.postMessage(message, '*');
        } catch (e) {
            // Cross-origin restrictions; best-effort only
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.app?.requestFullscreen?.().catch(() => {
                console.warn('Fullscreen not available');
            });
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    async togglePictureInPicture() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (this.player && document.pictureInPictureEnabled) {
                // Only works if iframe has allow="picture-in-picture"
                await this.player.requestPictureInPicture();
            } else {
                console.warn('Picture-in-Picture not supported here');
            }
        } catch (e) {
            console.warn('PiP failed:', e.message);
        }
    }

    toggleTheme() {
        window.homeController?.toggleTheme();
    }

    // ---------- Controls Auto-Hide ----------
    showControls() {
        this.controlsBar?.classList.remove('hidden');
        this.playerWrapper?.classList.add('controls-shown');
        this.controlsVisible = true;
        if (this.episodeInfo) this.episodeInfo.style.opacity = '1';
        this.app?.classList.remove('hide-cursor');
        this.resetControlsTimer();
    }

    hideControls() {
        if (this.controlsLocked || !this.isFullscreen) return;
        this.controlsBar?.classList.add('hidden');
        this.playerWrapper?.classList.remove('controls-shown');
        this.controlsVisible = false;
        if (this.episodeInfo) this.episodeInfo.style.opacity = '0';
        this.app?.classList.add('hide-cursor');
    }

    resetControlsTimer() {
        clearTimeout(this.controlsTimer);
        if (this.isFullscreen) {
            this.controlsTimer = setTimeout(() => this.hideControls(), 3000);
        }
    }

    // ---------- Event Binding ----------
    bindEvents() {
        const add = (el, event, handler) => el?.addEventListener(event, handler);

        add(this.playPauseBtn, 'click', (e) => { e.preventDefault(); this.togglePlay(); });

        add(this.prevEpisodeBtn, 'click', (e) => {
            e.preventDefault();
            this.hideNextOverlay();
            this.loadPreviousEpisode();
            this.resetControlsTimer();
        });

        add(this.nextEpisodeBtn, 'click', (e) => {
            e.preventDefault();
            this.hideNextOverlay();
            this.loadNextEpisode();
            this.resetControlsTimer();
        });

        add(this.skipIntroBtn?.querySelector('button'), 'click', (e) => {
            e.preventDefault();
            this.skipIntro();
            this.resetControlsTimer();
        });

        add(this.nextNowBtn, 'click', (e) => {
            e.preventDefault();
            this.hideNextOverlay();
            this.loadNextEpisode();
            this.resetControlsTimer();
        });

        add(this.fullscreenBtn, 'click', (e) => { e.preventDefault(); this.toggleFullscreen(); });
        add(this.pipBtn, 'click', (e) => { e.preventDefault(); this.togglePictureInPicture(); this.resetControlsTimer(); });

        add(this.speedSelector, 'change', (e) => { this.setSpeed(e.target.value); this.resetControlsTimer(); });
        add(this.volumeSlider, 'input', (e) => { this.setVolume(e.target.value); this.resetControlsTimer(); });
        add(this.muteBtn, 'click', (e) => { e.preventDefault(); this.toggleMute(); this.resetControlsTimer(); });

        add(this.themeBtn, 'click', (e) => { e.preventDefault(); this.toggleTheme(); this.resetControlsTimer(); });
        add(this.backBtn, 'click', (e) => { e.preventDefault(); this.goHome(); });

        add(this.seasonSelect, 'change', () => {
            if (this.selectorUpdating || this.destroyed) return;
            const season = parseInt(this.seasonSelect.value, 10);
            this.populateEpisodeSelector(season);
            if (this.episodeSelect) this.episodeSelect.value = '1';
            this.resetControlsTimer();
        });

        add(this.goToEpisodeBtn, 'click', (e) => { e.preventDefault(); this.goToEpisode(); this.resetControlsTimer(); });

        add(this.episodeSelect, 'keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.goToEpisode(); this.resetControlsTimer(); }
        });

        // Progress bar
        add(this.progressBar, 'click', (e) => {
            const rect = this.progressBar.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            this.seekTo(x * this.duration);
            this.resetControlsTimer();
        });

        // Touch seek
        let touchSeeking = false;
        add(this.progressBar, 'touchstart', (e) => {
            e.preventDefault();
            const rect = this.progressBar.getBoundingClientRect();
            const touch = e.touches[0];
            const x = (touch.clientX - rect.left) / rect.width;
            this.seekTo(x * this.duration);
            this.controlsLocked = true;
            touchSeeking = true;
        }, { passive: false });

        add(this.progressBar, 'touchmove', (e) => {
            if (!touchSeeking) return;
            e.preventDefault();
            const rect = this.progressBar.getBoundingClientRect();
            const touch = e.touches[0];
            const x = (touch.clientX - rect.left) / rect.width;
            const seekTime = x * this.duration;
            const percent = this.duration > 0 ? (seekTime / this.duration) * 100 : 0;
            if (this.progressFill) this.progressFill.style.width = `${Math.min(percent, 100)}%`;
        }, { passive: false });

        add(this.progressBar, 'touchend', () => {
            touchSeeking = false;
            this.controlsLocked = false;
            this.resetControlsTimer();
        });

        // Mouse seek
        let isSeeking = false;
        add(this.progressBar, 'mousedown', () => { isSeeking = true; this.controlsLocked = true; });
        document.addEventListener('mouseup', () => {
            if (isSeeking) {
                isSeeking = false;
                this.controlsLocked = false;
                this.resetControlsTimer();
            }
        });

        add(this.progressBar, 'mousemove', () => this.resetControlsTimer());

        // Shortcuts
        add(this.shortcutsHelp, 'click', () => this.showShortcuts());
        add(this.shortcutsHelp, 'keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.showShortcuts(); }
        });
        add(this.closeShortcuts, 'click', () => this.hideShortcuts());

        // Mouse enter/leave on player
        add(this.playerWrapper, 'mouseenter', () => {
            if (this.isFullscreen) { this.showControls(); }
        });
        add(this.playerWrapper, 'mousemove', () => {
            if (this.isFullscreen) { this.showControls(); this.resetControlsTimer(); }
        });
        add(this.playerWrapper, 'mouseleave', () => {
            if (this.isFullscreen) { this.resetControlsTimer(); }
        });

        // Tap-to-show on mobile
        add(this.playerWrapper, 'touchstart', () => {
            if (this.isFullscreen) { this.showControls(); }
        }, { passive: true });

        // Iframe error/load
        add(this.player, 'error', () => this.showError('Player failed to load'));
        add(this.player, 'load', () => this.showLoading(false));
    }

    _onMessage(e) {
        if (this.destroyed) return;
        if (e.data?.type === 'PLAYER_EVENT') {
            this.handlePlayerEvent(e.data.data);
        }
    }

    _onFullscreenChange() {
        if (this.destroyed) return;
        this.isFullscreen = !!document.fullscreenElement;
        if (this.isFullscreen) {
            this.showControls();
            this.resetControlsTimer();
        } else {
            clearTimeout(this.controlsTimer);
            this.app?.classList.remove('hide-cursor');
            this.controlsBar?.classList.remove('hidden');
            if (this.episodeInfo) this.episodeInfo.style.opacity = '1';
            this.controlsVisible = true;
        }
    }

    _onKeyDown(e) {
        if (this.destroyed) return;
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        const playerActive = this.playerScreen?.classList.contains('active');
        if (!playerActive) {
            if (e.key === 't' || e.key === 'T') { e.preventDefault(); this.toggleTheme(); }
            return;
        }

        if (this.shortcutsPopup?.classList.contains('active')) {
            if (e.key === 'Escape') { e.preventDefault(); this.hideShortcuts(); }
            return;
        }

        switch (e.key) {
            case ' ':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.seekTo(this.currentTime + 10);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.seekTo(this.currentTime - 10);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.setVolume(Math.min(1, this.volume + 0.05));
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.setVolume(Math.max(0, this.volume - 0.05));
                break;
            case 'n': case 'N':
                e.preventDefault();
                if (!this.nextEpisodeLoading) { this.hideNextOverlay(); this.loadNextEpisode(); }
                break;
            case 'p': case 'P':
                e.preventDefault();
                this.loadPreviousEpisode();
                break;
            case 'f': case 'F':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'i': case 'I':
                e.preventDefault();
                this.togglePictureInPicture();
                break;
            case 't': case 'T':
                e.preventDefault();
                this.toggleTheme();
                break;
            case 's': case 'S':
                e.preventDefault();
                if (!this.introSkipped && !this.skipIntroClicked) this.skipIntro();
                break;
            case 'm': case 'M':
                e.preventDefault();
                this.toggleMute();
                break;
            case '?':
                e.preventDefault();
                this.showShortcuts();
                break;
            case 'Escape':
                e.preventDefault();
                if (document.fullscreenElement) document.exitFullscreen?.();
                else if (document.pictureInPictureElement) document.exitPictureInPicture?.();
                else this.goHome();
                break;
        }
    }

    _onVisibilityChange() {
        if (this.destroyed) return;
        if (document.visibilityState === 'hidden') this.saveProgressNow();
    }

    _onBeforeUnload() {
        this.saveProgressNow();
    }

    saveProgressNow() {
        if (this.currentTime > 5 && this.duration > 0) {
            try {
                localStorage.setItem(this.getStorageKey(), String(Math.floor(this.currentTime)));
            } catch (e) {}
        }
    }

    // ---------- Player Event Handling ----------
    handlePlayerEvent(data) {
        if (this.destroyed || !data) return;

        const { player_status, player_progress, player_duration } = data;
        this.currentTime = player_progress || 0;
        this.duration = player_duration || 0;

        if (this.duration > 0) {
            try {
                localStorage.setItem(
                    `duration_${this.showId}_${this.currentSeason}_${this.currentEpisode}`,
                    String(Math.floor(this.duration))
                );
            } catch (e) {}

            const percent = (this.currentTime / this.duration) * 100;
            if (this.progressFill) this.progressFill.style.width = `${Math.min(percent, 100)}%`;
            if (this.currentTimeDisplay) this.currentTimeDisplay.textContent = this.formatTime(this.currentTime);
            if (this.totalTimeDisplay) this.totalTimeDisplay.textContent = this.formatTime(this.duration);
            if (this.progressBar) this.progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
        }

        if (player_status === 'playing') {
            if (this.playPauseBtn) this.playPauseBtn.textContent = '⏸';
            this.isPlaying = true;
        } else if (player_status === 'paused') {
            if (this.playPauseBtn) this.playPauseBtn.textContent = '▶';
            this.isPlaying = false;
        }

        // Throttle progress saves (once per 5s)
        if (player_status === 'playing' && this.currentTime > 5) {
            const now = Date.now();
            if (now - this._lastProgressSave > 5000) {
                this._lastProgressSave = now;
                try {
                    localStorage.setItem(this.getStorageKey(), String(Math.floor(this.currentTime)));
                } catch (e) {}
            }
            if (now - this._lastContinueSave > 10000) {
                this._lastContinueSave = now;
                updateContinueWatching(
                    this.showId,
                    this.currentSeason,
                    this.currentEpisode,
                    Math.floor(this.currentTime),
                    Math.floor(this.duration)
                );
            }
        }

        // Intro skip visibility
        if (!this.introSkipped && !this.skipIntroClicked &&
            this.currentTime > 5 && this.currentTime < this.config.introDuration) {
            this.showSkipIntro();
        } else if (this.currentTime >= this.config.introDuration) {
            this.hideSkipIntro();
            this.introSkipped = true;
        }

        // Episode end
        if (player_status === 'playing' && this.duration > 0 && !this.episodeEnded) {
            const timeToEnd = this.duration - this.currentTime;
            if (timeToEnd > 0 && timeToEnd < this.config.outroDuration && !this.nextEpisodeLoading) {
                this.episodeEnded = true;
                this.showNextOverlay();
            }
        }

        if (player_status === 'completed' && !this.episodeEnded) {
            this.episodeEnded = true;
            try { localStorage.setItem(this.getStorageKey(), String(Math.floor(this.duration))); } catch (e) {}
            if (!this.nextEpisodeLoading) setTimeout(() => this.showNextOverlay(), 1000);
        }
    }

    // ---------- Shortcuts Popup ----------
    showShortcuts() { this.shortcutsPopup?.classList.add('active'); }
    hideShortcuts() { this.shortcutsPopup?.classList.remove('active'); }

    // ---------- Navigation ----------
    goHome() {
        this.saveProgressNow();
        this.destroyed = true;

        try { this.player.src = 'about:blank'; } catch (e) {}

        clearInterval(this.nextEpisodeTimer);
        clearTimeout(this.controlsTimer);
        clearTimeout(this._seekTimeout);

        const homeScreen = document.getElementById('home-screen');
        const playerScreen = document.getElementById('player-screen');

        if (homeScreen) { homeScreen.classList.add('active'); homeScreen.style.display = 'flex'; }
        if (playerScreen) {
            playerScreen.classList.remove('active');
            playerScreen.style.display = 'none';
        }
        this.app?.classList.remove('hide-cursor');

        window.homeController?.renderContinueWatching();
        window.homeController?.renderRecentShows();

        try {
            if (document.fullscreenElement) document.exitFullscreen?.();
            if (document.pictureInPictureElement) document.exitPictureInPicture?.();
        } catch (e) {}

        window.player = null;
    }

    // ---------- Utilities ----------
    formatTime(seconds) {
        if (!seconds || seconds < 0 || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.saveProgressNow();

        document.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('message', this._onMessage);
        document.removeEventListener('fullscreenchange', this._onFullscreenChange);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        window.removeEventListener('beforeunload', this._onBeforeUnload);

        try { this.player.src = 'about:blank'; } catch (e) {}
        clearInterval(this.nextEpisodeTimer);
        clearTimeout(this.controlsTimer);
        clearTimeout(this._seekTimeout);
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Series Player initialized');

    if (window.location.protocol === 'file:') {
        console.warn('⚠️ Running from file:// protocol. For best results, use a local server.');
        console.warn('💡 Try: python -m http.server 8000 or npx serve');
    }

    // HomeController handles URL params internally — don't duplicate here.
    window.homeController = new HomeController();
});