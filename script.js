// ============================================
// MAIN PLAYER SCRIPT - With Server Selection
// ============================================

// ============================================
// HOME SCREEN CONTROLLER
// ============================================

class HomeController {
    constructor() {
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.searchError = document.getElementById('search-error');
        this.recentShows = document.getElementById('recent-shows');
        this.recentList = document.getElementById('recent-list');
        this.continueWatching = document.getElementById('continue-watching');
        this.continueList = document.getElementById('continue-list');
        this.isLoading = false;
        this.theme = localStorage.getItem('theme') || 'dark';
        
        this.applyTheme();
        this.bindEvents();
        this.renderRecentShows();
        this.renderContinueWatching();
        
        // Check for URL parameters on load
        const urlParams = getUrlParams();
        if (urlParams.showId) {
            setTimeout(() => {
                this.startShow(urlParams.showId, urlParams.season || 1, urlParams.episode || 1);
            }, 100);
        }
    }
    
    applyTheme() {
        if (this.theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    }
    
    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
    }
    
    bindEvents() {
        this.searchBtn.addEventListener('click', () => {
            this.handleSearch();
        });
        
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSearch();
            }
        });
        
        document.querySelectorAll('.example-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                this.searchInput.value = id;
                this.handleSearch();
            });
        });
        
        // Theme toggle from home
        document.addEventListener('keydown', (e) => {
            if (e.key === 't' || e.key === 'T') {
                if (!document.getElementById('player-screen').classList.contains('active')) {
                    this.toggleTheme();
                }
            }
        });
    }
    
    async handleSearch() {
        if (this.isLoading) return;
        
        const input = this.searchInput.value.trim();
        if (!input) {
            this.showError('Please enter a TMDB or IMDB ID');
            return;
        }
        
        this.hideError();
        this.isLoading = true;
        this.searchBtn.disabled = true;
        this.searchBtn.textContent = 'Loading...';
        
        try {
            const idType = input.startsWith('tt') ? 'imdb' : 'tmdb';
            const showData = await fetchShowData(input, idType);
            
            const totalEps = showData.episodesPerSeason;
            if (Object.keys(totalEps).length === 0) {
                this.showError('No episodes found for this show. Please check the ID.');
                return;
            }
            
            this.startShow(input, 1, 1);
            
        } catch (error) {
            this.showError(`Show not found: ${error.message || 'Please check the ID'}`);
        } finally {
            this.isLoading = false;
            this.searchBtn.disabled = false;
            this.searchBtn.textContent = '▶ Watch';
        }
    }
    
    startShow(showId, season, episode) {
        console.log('🎬 Starting show:', showId, season, episode);
        
        const homeScreen = document.getElementById('home-screen');
        const playerScreen = document.getElementById('player-screen');
        
        if (homeScreen) {
            homeScreen.classList.remove('active');
            homeScreen.style.display = 'none';
        }
        if (playerScreen) {
            playerScreen.classList.add('active');
            playerScreen.style.display = 'block';
        }
        
        if (window.player) {
            try {
                const iframe = document.getElementById('player');
                if (iframe) {
                    iframe.src = 'about:blank';
                }
                window.player = null;
            } catch (e) {}
        }
        
        const config = {
            showId: showId,
            startSeason: season || 1,
            startEpisode: episode || 1,
            introDuration: SHOW_CONFIG.introDuration || 90,
            outroDuration: SHOW_CONFIG.outroDuration || 30,
            nextEpisodeDelay: SHOW_CONFIG.nextEpisodeDelay || 5,
            showTitle: '',
            episodesPerSeason: {},
            cacheDuration: SHOW_CONFIG.cacheDuration || 3600000,
        };
        
        setTimeout(() => {
            window.player = new SeriesPlayer(config);
        }, 50);
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
                <span class="continue-title">${item.title}</span>
                <div class="continue-meta">
                    <span>S${String(item.season || 1).padStart(2, '0')}E${String(item.episode || 1).padStart(2, '0')}</span>
                    <span>${Math.floor(progress / 60)}m / ${Math.floor(total / 60)}m</span>
                </div>
                <div class="continue-progress-bar">
                    <div class="continue-progress-fill" style="width: ${percent}%"></div>
                </div>
                <button class="continue-remove" data-id="${item.id}">✕</button>
            `;
            
            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('continue-remove')) return;
                this.startShow(item.id, item.season || 1, item.episode || 1);
            });
            
            const removeBtn = div.querySelector('.continue-remove');
            removeBtn.addEventListener('click', (e) => {
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
            
            const resumeData = this.getResumePoint(item.id);
            
            div.innerHTML = `
                <span class="recent-title">${item.title || 'Unknown Show'}</span>
                <div class="recent-meta">
                    <span>S${String(resumeData?.season || item.season || 1).padStart(2, '0')}E${String(resumeData?.episode || item.episode || 1).padStart(2, '0')}</span>
                    <span class="recent-progress">${resumeData ? '▶ Resume' : ''}</span>
                    <button class="recent-remove" data-id="${item.id}">✕</button>
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
            
            const removeBtn = div.querySelector('.recent-remove');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeRecentShow(item.id);
                this.renderRecentShows();
            });
            
            this.recentList.appendChild(div);
        });
    }
    
    getResumePoint(showId) {
        let bestSeason = 1;
        let bestEpisode = 1;
        let bestProgress = 0;
        
        const cacheKey = `show_data_${showId}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                const epsPerSeason = data.episodesPerSeason || {};
                
                for (const [season, totalEps] of Object.entries(epsPerSeason)) {
                    for (let ep = 1; ep <= totalEps; ep++) {
                        const key = `progress_${showId}_${season}_${ep}`;
                        const progress = localStorage.getItem(key);
                        if (progress) {
                            const time = parseInt(progress);
                            const durationKey = `duration_${showId}_${season}_${ep}`;
                            const duration = parseInt(localStorage.getItem(durationKey) || '0');
                            
                            if (time > 30 && (duration === 0 || time < duration - 30)) {
                                if (time > bestProgress) {
                                    bestProgress = time;
                                    bestSeason = parseInt(season);
                                    bestEpisode = ep;
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Error parsing resume data:', e);
            }
        }
        
        return bestProgress > 0 ? { season: bestSeason, episode: bestEpisode } : null;
    }
    
    showError(message) {
        this.searchError.textContent = message;
        this.searchError.classList.remove('hidden');
    }
    
    hideError() {
        this.searchError.classList.add('hidden');
    }
}

// ============================================
// CONTINUE WATCHING MANAGEMENT
// ============================================

const CONTINUE_WATCHING_KEY = 'continue_watching';
const MAX_CONTINUE = 10;

function getContinueWatching() {
    try {
        const data = localStorage.getItem(CONTINUE_WATCHING_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function addContinueWatching(showId, title, season, episode, progress, duration) {
    let items = getContinueWatching();
    
    items = items.filter(item => item.id !== showId);
    
    items.unshift({
        id: showId,
        title: title || 'Unknown Show',
        season: season || 1,
        episode: episode || 1,
        progress: progress || 0,
        duration: duration || 0,
        lastWatched: Date.now()
    });
    
    if (items.length > MAX_CONTINUE) {
        items = items.slice(0, MAX_CONTINUE);
    }
    
    localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(items));
    return items;
}

function removeContinueWatching(showId) {
    let items = getContinueWatching();
    items = items.filter(item => item.id !== showId);
    localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(items));
    return items;
}

function updateContinueWatching(showId, season, episode, progress, duration) {
    let items = getContinueWatching();
    const existing = items.find(item => item.id === showId);
    
    if (existing) {
        existing.season = season;
        existing.episode = episode;
        existing.progress = progress;
        existing.duration = duration;
        existing.lastWatched = Date.now();
        items = items.filter(item => item.id !== showId);
        items.unshift(existing);
    } else {
        const recent = getRecentShows();
        const show = recent.find(item => item.id === showId);
        const title = show?.title || 'Unknown Show';
        
        items.unshift({
            id: showId,
            title: title,
            season: season,
            episode: episode,
            progress: progress || 0,
            duration: duration || 0,
            lastWatched: Date.now()
        });
    }
    
    if (items.length > MAX_CONTINUE) {
        items = items.slice(0, MAX_CONTINUE);
    }
    
    localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(items));
    return items;
}

// ============================================
// PLAYER CLASS - With Server Selection
// ============================================

class SeriesPlayer {
    constructor(config) {
        console.log('🎮 SeriesPlayer constructor called with config:', config);
        
        if (!config || !config.showId) {
            console.error('❌ Player initialized without showId!');
            return;
        }
        
        this.config = config;
        this.showId = config.showId;
        this.currentSeason = config.startSeason || 1;
        this.currentEpisode = config.startEpisode || 1;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.introSkipped = false;
        this.nextEpisodeTimer = null;
        this.episodeEnded = false;
        this.isLoading = false;
        this.skipIntroClicked = false;
        this.nextEpisodeLoading = false;
        this.initialized = false;
        this.selectorUpdating = false;
        this.currentSpeed = 1;
        this.episodeTitles = {};
        this.pipActive = false;
        this.controlsTimer = null;
        this.controlsVisible = true;
        this.controlsLocked = false;
        this.isFullscreen = false;
        this.initialLoad = true;
        this.currentUrl = '';
        this._toggleTimeout = null;
        this._seekTimeout = null;
        this.manualAdvance = false;
        this.currentServer = getSelectedServer();
        
        // DOM Elements
        this.player = document.getElementById('player');
        this.playerWrapper = document.getElementById('player-wrapper');
        this.playerScreen = document.getElementById('player-screen');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevEpisodeBtn = document.getElementById('prev-episode-btn');
        this.nextEpisodeBtn = document.getElementById('next-episode-btn');
        this.episodeCounter = document.getElementById('episode-counter');
        this.showTitle = document.getElementById('show-title');
        this.episodeLabel = document.getElementById('episode-label');
        this.episodeTitle = document.getElementById('episode-title');
        this.progressFill = document.getElementById('progress-fill');
        this.progressBuffer = document.getElementById('progress-buffer');
        this.progressBar = document.getElementById('progress-bar');
        this.currentTimeDisplay = document.getElementById('current-time');
        this.totalTimeDisplay = document.getElementById('total-time');
        this.skipIntroBtn = document.getElementById('skip-intro');
        this.nextOverlay = document.getElementById('next-episode-overlay');
        this.nextCountdown = document.getElementById('next-countdown');
        this.nextNowBtn = document.getElementById('next-now-btn');
        this.fullscreenBtn = document.getElementById('fullscreen-btn');
        this.pipBtn = document.getElementById('pip-btn');
        this.loadingIndicator = document.getElementById('loading-indicator');
        this.backBtn = document.getElementById('back-btn');
        this.speedSelector = document.getElementById('speed-selector');
        this.qualitySelector = document.getElementById('quality-selector');
        this.serverSelector = document.getElementById('server-selector');
        this.themeBtn = document.getElementById('theme-btn');
        this.shortcutsHelp = document.getElementById('shortcuts-help');
        this.shortcutsPopup = document.getElementById('shortcuts-popup');
        this.closeShortcuts = document.getElementById('close-shortcuts');
        this.progressThumbnail = document.getElementById('progress-thumbnail');
        this.thumbTime = document.querySelector('.thumb-time');
        this.thumbImg = document.querySelector('#progress-thumbnail img');
        this.controlsBar = document.getElementById('controls-bar');
        this.episodeInfo = document.getElementById('episode-info');
        
        // Episode Selector Elements
        this.seasonSelect = document.getElementById('season-select');
        this.episodeSelect = document.getElementById('episode-select');
        this.goToEpisodeBtn = document.getElementById('go-to-episode-btn');
        
        // Populate server selector
        this.populateServerSelector();
        
        this.bindEvents();
        this.initializePlayer();
    }
    
    populateServerSelector() {
        if (!this.serverSelector) return;
        
        this.serverSelector.innerHTML = '';
        SHOW_CONFIG.servers.forEach(server => {
            const option = document.createElement('option');
            option.value = server.id;
            option.textContent = server.name;
            if (server.id === this.currentServer.id) {
                option.selected = true;
            }
            this.serverSelector.appendChild(option);
        });
        
        this.serverSelector.addEventListener('change', (e) => {
            const serverId = e.target.value;
            const server = SHOW_CONFIG.servers.find(s => s.id === serverId);
            if (server) {
                this.switchServer(server);
            }
        });
    }
    
    switchServer(server) {
        console.log(`🔄 Switching to server: ${server.name} (${server.url})`);
        
        this.currentServer = server;
        setSelectedServer(server.id);
        
        const resumeTime = this.currentTime > 5 ? this.currentTime : 0;
        const url = this.buildPlayerUrlWithServer(
            this.currentSeason, 
            this.currentEpisode, 
            resumeTime,
            server
        );
        
        if (this.player) {
            this.player.src = url;
            this.currentUrl = url;
        }
        
        this.showServerNotification(`Switched to ${server.name}`);
    }
    
    showServerNotification(message) {
        const existing = document.querySelector('.server-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = 'server-notification';
        notification.textContent = `🔄 ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Override buildPlayerUrl to use selected server
    buildPlayerUrl(season, episode, resumeTime = 0) {
        return this.buildPlayerUrlWithServer(season, episode, resumeTime, this.currentServer);
    }
    
    buildPlayerUrlWithServer(season, episode, resumeTime = 0, server = null) {
        const baseUrl = server ? server.url : getServerUrl();
        let url = `${baseUrl}/embed/tv/${this.showId}/${season}/${episode}`;
        const params = new URLSearchParams();
        params.set('autoplay', '1');
        params.set('controls', '0');
        if (resumeTime > 0) params.set('resumeAt', resumeTime);
        return url + '?' + params.toString();
    }
    
    async initializePlayer() {
        try {
            this.showLoading(true);
            
            const idType = typeof this.showId === 'string' && this.showId.startsWith('tt') ? 'imdb' : 'tmdb';
            const showData = await fetchShowData(this.showId, idType);
            this.showData = showData;
            
            this.config.showTitle = showData.title;
            this.config.episodesPerSeason = showData.episodesPerSeason;
            
            // Fetch episode titles if available
            if (showData.seasons) {
                showData.seasons.forEach(season => {
                    if (season.episodes) {
                        season.episodes.forEach(ep => {
                            const key = `${season.season_number}_${ep.episode_number}`;
                            this.episodeTitles[key] = ep.name || '';
                        });
                    }
                });
            }
            
            if (this.showTitle) {
                this.showTitle.textContent = showData.title;
            }
            document.title = `${showData.title} - Series Player`;
            
            this.populateSeasonSelector();
            
            addRecentShow(this.showId, showData.title, this.currentSeason, this.currentEpisode);
            
            this.loadEpisode(this.currentSeason, this.currentEpisode, true);
            
            this.initialized = true;
            console.log(`🎬 "${showData.title}" loaded successfully!`);
            console.log(`📺 Starting at S${this.currentSeason}E${this.currentEpisode}`);
            
        } catch (error) {
            console.error('Failed to load show:', error);
            if (this.showTitle) {
                this.showTitle.textContent = 'Error loading show';
            }
            if (this.episodeLabel) {
                this.episodeLabel.textContent = 'Please check the ID and try again';
            }
            
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #ff6b6b;
                font-size: 16px;
                text-align: center;
                background: rgba(0,0,0,0.8);
                padding: 30px;
                border-radius: 8px;
                z-index: 50;
                max-width: 500px;
            `;
            errorMsg.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                <div style="font-weight: 600; margin-bottom: 8px;">Failed to load show</div>
                <div style="color: #888; font-size: 14px;">${error.message || 'Please check the ID and try again'}</div>
                <button onclick="window.location.reload()" style="
                    margin-top: 16px;
                    padding: 10px 24px;
                    background: #e50914;
                    border: none;
                    border-radius: 6px;
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                ">Go Back</button>
            `;
            const wrapper = document.getElementById('player-wrapper');
            if (wrapper) {
                wrapper.appendChild(errorMsg);
            }
        } finally {
            this.showLoading(false);
        }
    }
    
    populateSeasonSelector() {
        if (!this.seasonSelect) return;
        
        const seasons = Object.keys(this.config.episodesPerSeason).sort((a, b) => a - b);
        this.seasonSelect.innerHTML = '';
        
        seasons.forEach(season => {
            const option = document.createElement('option');
            option.value = season;
            option.textContent = season;
            this.seasonSelect.appendChild(option);
        });
        
        this.seasonSelect.value = this.currentSeason;
        this.populateEpisodeSelector(this.currentSeason);
    }
    
    populateEpisodeSelector(season) {
        if (!this.episodeSelect) return;
        
        const totalEps = this.config.episodesPerSeason[season] || 0;
        this.episodeSelect.innerHTML = '';
        
        for (let i = 1; i <= totalEps; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            this.episodeSelect.appendChild(option);
        }
        
        this.episodeSelect.value = this.currentEpisode;
    }
    
    getEpisodeTitle(season, episode) {
        const key = `${season}_${episode}`;
        return this.episodeTitles[key] || '';
    }
    
    showLoading(show) {
        if (this.loadingIndicator) {
            if (show) {
                this.loadingIndicator.classList.add('active');
            } else {
                this.loadingIndicator.classList.remove('active');
            }
        }
    }
    
    // ---------- Episode Loading ----------
    loadEpisode(season, episode, checkResume = true) {
        if (this.isLoading) {
            console.log('⏳ Already loading, skipping...');
            return;
        }
        
        const totalEps = this.config.episodesPerSeason?.[season];
        if (!totalEps || episode > totalEps) {
            console.log(`Season ${season} Episode ${episode} not found.`);
            return;
        }
        
        this.isLoading = true;
        this.currentSeason = season;
        this.currentEpisode = episode;
        this.episodeEnded = false;
        this.introSkipped = false;
        this.skipIntroClicked = false;
        this.nextEpisodeLoading = false;
        this.initialLoad = true;
        setTimeout(() => {
            this.manualAdvance = false;
        }, 2000);
        
        if (!this.selectorUpdating) {
            this.selectorUpdating = true;
            if (this.seasonSelect) this.seasonSelect.value = season;
            this.populateEpisodeSelector(season);
            if (this.episodeSelect) this.episodeSelect.value = episode;
            this.selectorUpdating = false;
        }
        
        updateRecentShowProgress(this.showId, season, episode);
        
        let resumeTime = 0;
        if (checkResume) {
            const saved = localStorage.getItem(this.getStorageKey());
            if (saved) {
                const parsed = parseInt(saved);
                if (parsed > 30) {
                    if (this.duration > 0 && parsed < this.duration - 30) {
                        resumeTime = parsed;
                    } else if (this.duration === 0) {
                        resumeTime = parsed;
                    }
                }
            }
        }
        
        const url = this.buildPlayerUrl(season, episode, resumeTime);
        this.currentUrl = url;
        if (this.player) {
            this.player.src = url;
        }
        
        this.updateEpisodeInfo(season, episode);
        this.hideSkipIntro();
        this.hideNextOverlay();
        this.resetProgress();
        
        if (this.episodeCounter) {
            this.episodeCounter.textContent = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        }
        
        console.log(`📺 Loading S${season}E${episode}${resumeTime > 0 ? ` (resuming at ${resumeTime}s)` : ''}`);
        
        setTimeout(() => {
            this.isLoading = false;
            this.initialLoad = false;
        }, 1500);
    }
    
    getStorageKey() {
        return `progress_${this.showId}_${this.currentSeason}_${this.currentEpisode}`;
    }
    
    // ---------- UI Updates ----------
    updateEpisodeInfo(season, episode) {
        if (this.episodeLabel) {
            this.episodeLabel.textContent = `Season ${season}, Episode ${episode}`;
        }
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
    }
    
    showSkipIntro() {
        if (!this.introSkipped && !this.skipIntroClicked && this.skipIntroBtn) {
            this.skipIntroBtn.classList.remove('hidden');
        }
    }
    
    hideSkipIntro() {
        if (this.skipIntroBtn) {
            this.skipIntroBtn.classList.add('hidden');
        }
    }
    
    showNextOverlay() {
        if (this.nextEpisodeLoading || this.manualAdvance) {
            console.log('Overlay blocked: loading or manual advance');
            return;
        }
        if (this.nextOverlay && !this.nextOverlay.classList.contains('hidden')) {
            console.log('Overlay already visible, skipping');
            return;
        }
        if (this.nextOverlay) {
            this.nextOverlay.classList.remove('hidden');
        }
        let countdown = this.config.nextEpisodeDelay || 5;
        if (this.nextCountdown) {
            this.nextCountdown.textContent = countdown;
        }
        clearInterval(this.nextEpisodeTimer);
        this.nextEpisodeTimer = setInterval(() => {
            countdown--;
            if (this.nextCountdown) {
                this.nextCountdown.textContent = countdown;
            }
            if (countdown <= 0) {
                clearInterval(this.nextEpisodeTimer);
                this.loadNextEpisode();
            }
        }, 1000);
    }
    
    hideNextOverlay() {
        if (this.nextOverlay) {
            this.nextOverlay.classList.add('hidden');
        }
        clearInterval(this.nextEpisodeTimer);
    }
    
    // ---------- Episode Navigation ----------
    loadNextEpisode() {
        if (this.nextEpisodeLoading) {
            console.log('⏳ Already loading next episode');
            return;
        }
        this.nextEpisodeLoading = true;
        this.manualAdvance = true;
        this.hideNextOverlay();
        const nextEpisode = this.currentEpisode + 1;
        const totalEps = this.config.episodesPerSeason?.[this.currentSeason] || 0;
        if (nextEpisode <= totalEps) {
            this.loadEpisode(this.currentSeason, nextEpisode, false);
        } else {
            this.loadNextSeason();
        }
        setTimeout(() => {
            this.nextEpisodeLoading = false;
        }, 2000);
    }
    
    loadPreviousEpisode() {
        if (this.currentEpisode > 1) {
            this.manualAdvance = true;
            this.loadEpisode(this.currentSeason, this.currentEpisode - 1, false);
            setTimeout(() => {
                this.manualAdvance = false;
            }, 2000);
        } else if (this.currentSeason > 1) {
            const prevSeason = this.currentSeason - 1;
            const totalEps = this.config.episodesPerSeason?.[prevSeason] || 0;
            if (totalEps > 0) {
                this.manualAdvance = true;
                this.loadEpisode(prevSeason, totalEps, false);
                setTimeout(() => {
                    this.manualAdvance = false;
                }, 2000);
            }
        }
    }
    
    loadNextSeason() {
        const nextSeason = this.currentSeason + 1;
        if (this.config.episodesPerSeason?.[nextSeason]) {
            this.manualAdvance = true;
            this.loadEpisode(nextSeason, 1, false);
            setTimeout(() => {
                this.manualAdvance = false;
            }, 2000);
        } else {
            console.log('🎉 Series complete!');
            if (this.episodeLabel) {
                this.episodeLabel.textContent = '🎉 Series Complete!';
            }
            if (this.episodeTitle) {
                this.episodeTitle.textContent = '';
            }
            this.hideNextOverlay();
        }
    }
    
    goToEpisode() {
        if (this.selectorUpdating) return;
        const season = parseInt(this.seasonSelect?.value || this.currentSeason);
        const episode = parseInt(this.episodeSelect?.value || this.currentEpisode);
        if (season !== this.currentSeason || episode !== this.currentEpisode) {
            this.hideNextOverlay();
            this.manualAdvance = true;
            this.loadEpisode(season, episode, true);
            setTimeout(() => {
                this.manualAdvance = false;
            }, 2000);
        }
    }
    
    // ---------- Controls Auto-Hide ----------
    showControls() {
        if (this.controlsBar) {
            this.controlsBar.classList.remove('hidden');
            this.controlsVisible = true;
            if (this.episodeInfo) {
                this.episodeInfo.style.opacity = '1';
            }
        }
        this.resetControlsTimer();
        if (this.playerScreen) {
            this.playerScreen.classList.remove('hide-cursor');
        }
    }
    
    hideControls() {
        if (this.controlsLocked) return;
        if (this.controlsBar && this.isFullscreen) {
            this.controlsBar.classList.add('hidden');
            this.controlsVisible = false;
            if (this.episodeInfo && this.isFullscreen) {
                this.episodeInfo.style.opacity = '0';
            }
        }
        if (this.playerScreen && this.isFullscreen) {
            this.playerScreen.classList.add('hide-cursor');
        }
    }
    
    resetControlsTimer() {
        if (this.controlsTimer) {
            clearTimeout(this.controlsTimer);
            this.controlsTimer = null;
        }
        if (this.isFullscreen) {
            this.controlsTimer = setTimeout(() => {
                this.hideControls();
            }, 3000);
        }
    }
    
    // ---------- Toggle Fullscreen ----------
    toggleFullscreen() {
        const app = document.getElementById('app');
        if (!document.fullscreenElement) {
            app?.requestFullscreen?.().then(() => {
                this.isFullscreen = true;
                this.showControls();
                this.resetControlsTimer();
            }).catch(err => {
                console.log('Fullscreen error:', err);
            });
        } else {
            document.exitFullscreen?.().then(() => {
                this.isFullscreen = false;
                this.showControls();
                if (this.controlsTimer) {
                    clearTimeout(this.controlsTimer);
                    this.controlsTimer = null;
                }
                if (this.playerScreen) {
                    this.playerScreen.classList.remove('hide-cursor');
                }
                if (this.controlsBar) {
                    this.controlsBar.classList.remove('hidden');
                }
                if (this.episodeInfo) {
                    this.episodeInfo.style.opacity = '1';
                }
            });
        }
    }
    
    // ---------- Player Controls ----------
    togglePlay() {
        if (this._toggleTimeout) return;
        this._toggleTimeout = setTimeout(() => {
            this._toggleTimeout = null;
            this._doTogglePlay();
        }, 300);
    }
    
    _doTogglePlay() {
        if (!this.player || !this.currentUrl) return;
        try {
            const message = {
                type: 'PLAYER_CONTROL',
                action: this.isPlaying ? 'pause' : 'play'
            };
            this.player.contentWindow?.postMessage(message, '*');
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = this.isPlaying ? '▶' : '⏸';
            }
            this.isPlaying = !this.isPlaying;
            console.log(`🎮 ${this.isPlaying ? 'Playing' : 'Paused'} (via postMessage)`);
            return;
        } catch (error) {
            this._fallbackTogglePlay();
        }
    }
    
    _fallbackTogglePlay() {
        if (!this.player || !this.currentUrl) return;
        const newAutoplay = this.isPlaying ? '0' : '1';
        const resumeTime = this.currentTime > 5 ? this.currentTime : 0;
        const baseUrl = `https://vaplayer.ru/embed/tv/${this.showId}/${this.currentSeason}/${this.currentEpisode}`;
        const params = new URLSearchParams();
        params.set('autoplay', newAutoplay);
        params.set('controls', '0');
        if (resumeTime > 0) params.set('resumeAt', resumeTime);
        const newUrl = baseUrl + '?' + params.toString();
        this.player.src = newUrl;
        this.currentUrl = newUrl;
        this.isPlaying = !this.isPlaying;
        if (this.playPauseBtn) this.playPauseBtn.textContent = this.isPlaying ? '⏸' : '▶';
        console.log(`🎮 ${this.isPlaying ? 'Playing' : 'Paused'} (fallback reload with resumeAt)`);
    }
    
    togglePictureInPicture() {
        try {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
                this.pipActive = false;
            } else if (this.player) {
                this.player.requestPictureInPicture();
                this.pipActive = true;
            }
        } catch (error) {
            console.log('PiP not supported:', error);
        }
    }
    
    setSpeed(speed) {
        this.currentSpeed = parseFloat(speed);
        try {
            const message = {
                type: 'PLAYER_CONTROL',
                action: 'speed',
                value: this.currentSpeed
            };
            this.player.contentWindow?.postMessage(message, '*');
        } catch (error) {
            console.log('Speed control not supported');
        }
        console.log(`Speed set to ${this.currentSpeed}x`);
    }
    
    toggleTheme() {
        if (window.homeController) {
            window.homeController.toggleTheme();
        }
    }
    
    goHome() {
        if (this.player) {
            this.player.src = 'about:blank';
            this.currentUrl = '';
        }
        clearInterval(this.nextEpisodeTimer);
        if (this.controlsTimer) {
            clearTimeout(this.controlsTimer);
            this.controlsTimer = null;
        }
        const homeScreen = document.getElementById('home-screen');
        const playerScreen = document.getElementById('player-screen');
        if (homeScreen) {
            homeScreen.classList.add('active');
            homeScreen.style.display = 'flex';
        }
        if (playerScreen) {
            playerScreen.classList.remove('active');
            playerScreen.style.display = 'none';
            playerScreen.classList.remove('hide-cursor');
        }
        if (window.homeController) {
            window.homeController.renderContinueWatching();
            window.homeController.renderRecentShows();
        }
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
        }
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture?.();
        }
        window.player = null;
    }
    
    showShortcuts() {
        this.shortcutsPopup.classList.add('active');
    }
    
    hideShortcuts() {
        this.shortcutsPopup.classList.remove('active');
    }
    
    // ---------- Seek ----------
    seekTo(time) {
        if (this._seekTimeout) return;
        this._seekTimeout = setTimeout(() => {
            this._seekTimeout = null;
            this._doSeek(time);
        }, 100);
    }
    
    _doSeek(time) {
        const clampedTime = Math.max(0, Math.min(time, this.duration));
        try {
            const message = {
                type: 'PLAYER_CONTROL',
                action: 'seek',
                value: clampedTime
            };
            this.player.contentWindow?.postMessage(message, '*');
            console.log(`⏩ Seeking to ${this.formatTime(clampedTime)} via postMessage`);
        } catch (error) {
            const url = this.buildPlayerUrl(this.currentSeason, this.currentEpisode, clampedTime);
            this.currentUrl = url;
            if (this.player) {
                this.player.src = url;
            }
            console.log(`⏩ Seeking to ${this.formatTime(clampedTime)} (fallback reload)`);
        }
        this.resetControlsTimer();
    }
    
    skipIntro() {
        if (!this.introSkipped) {
            this.seekTo(this.config.introDuration);
            this.hideSkipIntro();
            this.introSkipped = true;
            this.skipIntroClicked = true;
        }
    }
    
    // ---------- Event Binding ----------
    bindEvents() {
        // Play/Pause
        this.playPauseBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.togglePlay();
            this.resetControlsTimer();
        });
        
        // Previous/Next
        this.prevEpisodeBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideNextOverlay();
            this.loadPreviousEpisode();
            this.resetControlsTimer();
        });
        this.nextEpisodeBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideNextOverlay();
            this.loadNextEpisode();
            this.resetControlsTimer();
        });
        
        // Skip Intro
        this.skipIntroBtn?.querySelector('button')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.skipIntroClicked = true;
            this.skipIntro();
            this.resetControlsTimer();
        });
        
        // Next Now
        this.nextNowBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideNextOverlay();
            this.loadNextEpisode();
            this.resetControlsTimer();
        });
        
        // Fullscreen
        this.fullscreenBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleFullscreen();
        });
        
        // Picture-in-Picture
        this.pipBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.togglePictureInPicture();
            this.resetControlsTimer();
        });
        
        // Speed selector
        this.speedSelector?.addEventListener('change', (e) => {
            this.setSpeed(e.target.value);
            this.resetControlsTimer();
        });
        
        // Quality selector
        this.qualitySelector?.addEventListener('change', (e) => {
            console.log('Quality selected:', e.target.value);
            this.resetControlsTimer();
        });
        
        // Theme toggle
        this.themeBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleTheme();
            this.resetControlsTimer();
        });
        
        // Back to home
        this.backBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.goHome();
        });
        
        // Episode Selector
        this.seasonSelect?.addEventListener('change', () => {
            if (this.selectorUpdating) return;
            const season = parseInt(this.seasonSelect.value);
            this.populateEpisodeSelector(season);
            this.episodeSelect.value = 1;
            this.resetControlsTimer();
        });
        
        this.goToEpisodeBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.goToEpisode();
            this.resetControlsTimer();
        });
        
        this.episodeSelect?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.goToEpisode();
                this.resetControlsTimer();
            }
        });
        
        // Progress bar - Click seek
        this.progressBar?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = this.progressBar.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const seekTime = x * this.duration;
            this.seekTo(seekTime);
            this.resetControlsTimer();
        });
        
        // Progress bar - Touch support
        let touchSeeking = false;
        this.progressBar?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = this.progressBar.getBoundingClientRect();
            const touch = e.touches[0];
            const x = (touch.clientX - rect.left) / rect.width;
            const seekTime = x * this.duration;
            this.seekTo(seekTime);
            this.controlsLocked = true;
            touchSeeking = true;
        }, { passive: false });
        
        this.progressBar?.addEventListener('touchmove', (e) => {
            if (!touchSeeking) return;
            e.preventDefault();
            const rect = this.progressBar.getBoundingClientRect();
            const touch = e.touches[0];
            const x = (touch.clientX - rect.left) / rect.width;
            const seekTime = x * this.duration;
            if (this.progressThumbnail) {
                const thumbWidth = 160;
                let left = touch.clientX - rect.left - thumbWidth / 2;
                left = Math.max(0, Math.min(left, rect.width - thumbWidth));
                this.progressThumbnail.style.left = left + 'px';
                this.progressThumbnail.classList.add('show');
                if (this.thumbTime) {
                    this.thumbTime.textContent = this.formatTime(seekTime);
                }
            }
            const percent = (seekTime / this.duration) * 100;
            if (this.progressFill) {
                this.progressFill.style.width = `${Math.min(percent, 100)}%`;
            }
        }, { passive: false });
        
        this.progressBar?.addEventListener('touchend', (e) => {
            if (touchSeeking) {
                touchSeeking = false;
                this.controlsLocked = false;
                this.resetControlsTimer();
                if (this.progressThumbnail) {
                    this.progressThumbnail.classList.remove('show');
                }
            }
        });
        
        // Progress bar mouse events for seeking and thumbnail
        let isSeeking = false;
        this.progressBar?.addEventListener('mousedown', (e) => {
            isSeeking = true;
            this.controlsLocked = true;
        });
        
        document.addEventListener('mouseup', () => {
            if (isSeeking) {
                isSeeking = false;
                this.controlsLocked = false;
                this.resetControlsTimer();
            }
        });
        
        this.progressBar?.addEventListener('mousemove', (e) => {
            const rect = this.progressBar.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const seekTime = x * this.duration;
            if (this.progressThumbnail) {
                const thumbWidth = 160;
                let left = e.clientX - rect.left - thumbWidth / 2;
                left = Math.max(0, Math.min(left, rect.width - thumbWidth));
                this.progressThumbnail.style.left = left + 'px';
                this.progressThumbnail.classList.add('show');
                if (this.thumbTime) {
                    this.thumbTime.textContent = this.formatTime(seekTime);
                }
            }
            this.resetControlsTimer();
        });
        
        this.progressBar?.addEventListener('mouseleave', () => {
            if (this.progressThumbnail) {
                this.progressThumbnail.classList.remove('show');
            }
        });
        
        // Shortcuts
        this.shortcutsHelp?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showShortcuts();
        });
        this.closeShortcuts?.addEventListener('click', (e) => {
            e.preventDefault();
            this.hideShortcuts();
        });
        
        // Player wrapper mouse events for controls show/hide
        this.playerWrapper?.addEventListener('mousemove', () => {
            if (this.isFullscreen) {
                this.showControls();
                this.resetControlsTimer();
            }
        });
        
        this.playerWrapper?.addEventListener('mouseleave', () => {
            if (this.isFullscreen) {
                this.resetControlsTimer();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }
            const playerScreen = document.getElementById('player-screen');
            if (!playerScreen || !playerScreen.classList.contains('active')) {
                if (e.key === 't' || e.key === 'T') {
                    e.preventDefault();
                    this.toggleTheme();
                }
                return;
            }
            if (this.shortcutsPopup && this.shortcutsPopup.classList.contains('active')) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideShortcuts();
                }
                return;
            }
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    e.stopPropagation();
                    this.togglePlay();
                    this.resetControlsTimer();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    e.stopPropagation();
                    this.seekTo(this.currentTime + 10);
                    this.resetControlsTimer();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    e.stopPropagation();
                    this.seekTo(this.currentTime - 10);
                    this.resetControlsTimer();
                    break;
                case 'n':
                case 'N':
                    e.preventDefault();
                    e.stopPropagation();
                    if (!this.nextEpisodeLoading) {
                        this.hideNextOverlay();
                        this.loadNextEpisode();
                        this.resetControlsTimer();
                    }
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    e.stopPropagation();
                    this.loadPreviousEpisode();
                    this.resetControlsTimer();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleFullscreen();
                    break;
                case 'i':
                case 'I':
                    e.preventDefault();
                    e.stopPropagation();
                    this.togglePictureInPicture();
                    this.resetControlsTimer();
                    break;
                case 't':
                case 'T':
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleTheme();
                    this.resetControlsTimer();
                    break;
                case 's':
                case 'S':
                    e.preventDefault();
                    e.stopPropagation();
                    if (!this.introSkipped && !this.skipIntroClicked) {
                        this.skipIntroClicked = true;
                        this.skipIntro();
                        this.resetControlsTimer();
                    }
                    break;
                case '?':
                    e.preventDefault();
                    e.stopPropagation();
                    this.showShortcuts();
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (document.fullscreenElement) {
                        document.exitFullscreen?.();
                    } else if (document.pictureInPictureElement) {
                        document.exitPictureInPicture?.();
                    } else {
                        this.goHome();
                    }
                    break;
            }
        });
        
        // PostMessage listener for player events
        window.addEventListener('message', (e) => {
            if (e.data.type !== 'PLAYER_EVENT') return;
            this.handlePlayerEvent(e.data.data);
        });
        
        // Fullscreen change
        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen = !!document.fullscreenElement;
            this.updateFullscreenIcon();
            if (this.isFullscreen) {
                this.showControls();
                this.resetControlsTimer();
            } else {
                if (this.controlsTimer) {
                    clearTimeout(this.controlsTimer);
                    this.controlsTimer = null;
                }
                if (this.playerScreen) {
                    this.playerScreen.classList.remove('hide-cursor');
                }
                if (this.controlsBar) {
                    this.controlsBar.classList.remove('hidden');
                }
                if (this.episodeInfo) {
                    this.episodeInfo.style.opacity = '1';
                }
                this.controlsVisible = true;
            }
        });
        
        // Picture-in-Picture change
        document.addEventListener('enterpictureinpicture', () => {
            this.pipActive = true;
        });
        document.addEventListener('leavepictureinpicture', () => {
            this.pipActive = false;
        });
        
        // Beforeunload save
        window.addEventListener('beforeunload', () => {
            if (this.currentTime > 5) {
                localStorage.setItem(this.getStorageKey(), Math.floor(this.currentTime));
            }
        });
    }
    
    // ---------- Player Event Handling ----------
    handlePlayerEvent(data) {
        const { player_status, player_progress, player_duration } = data;
        this.currentTime = player_progress || 0;
        this.duration = player_duration || 0;
        if (this.duration > 0) {
            localStorage.setItem(`duration_${this.showId}_${this.currentSeason}_${this.currentEpisode}`, Math.floor(this.duration));
        }
        if (this.duration > 0) {
            const percent = (this.currentTime / this.duration) * 100;
            if (this.progressFill) {
                this.progressFill.style.width = `${Math.min(percent, 100)}%`;
            }
            if (this.currentTimeDisplay) {
                this.currentTimeDisplay.textContent = this.formatTime(this.currentTime);
            }
            if (this.totalTimeDisplay) {
                this.totalTimeDisplay.textContent = this.formatTime(this.duration);
            }
        }
        if (player_status === 'playing') {
            if (this.playPauseBtn) this.playPauseBtn.textContent = '⏸';
            this.isPlaying = true;
        } else if (player_status === 'paused') {
            if (this.playPauseBtn) this.playPauseBtn.textContent = '▶';
            this.isPlaying = false;
        }
        // Save progress - skip during initial load
        if (player_status === 'playing' && this.currentTime > 5 && !this.initialLoad) {
            localStorage.setItem(this.getStorageKey(), Math.floor(this.currentTime));
            updateContinueWatching(
                this.showId,
                this.currentSeason,
                this.currentEpisode,
                Math.floor(this.currentTime),
                Math.floor(this.duration)
            );
        }
        // Check for intro skip
        if (!this.introSkipped && !this.skipIntroClicked && this.currentTime > 5 && this.currentTime < this.config.introDuration) {
            this.showSkipIntro();
        } else if (this.currentTime >= this.config.introDuration) {
            this.hideSkipIntro();
            if (this.currentTime >= this.config.introDuration) {
                this.introSkipped = true;
            }
        }
        // Check for episode end
        if (player_status === 'playing' && this.duration > 0 && !this.manualAdvance) {
            const timeToEnd = this.duration - this.currentTime;
            if (timeToEnd > 0 && timeToEnd < this.config.outroDuration && 
                !this.episodeEnded && !this.nextEpisodeLoading) {
                this.episodeEnded = true;
                this.showNextOverlay();
            }
        }
        // Handle completed status - ignore if manually advancing
        if (player_status === 'completed' && !this.episodeEnded && !this.manualAdvance) {
            this.episodeEnded = true;
            localStorage.setItem(this.getStorageKey(), Math.floor(this.duration));
            if (!this.nextEpisodeLoading && this.nextOverlay && this.nextOverlay.classList.contains('hidden')) {
                setTimeout(() => {
                    this.showNextOverlay();
                }, 1000);
            }
        }
    }
    
    // ---------- Utilities ----------
    formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }
    
    updateFullscreenIcon() {
        if (this.fullscreenBtn) {
            this.fullscreenBtn.textContent = document.fullscreenElement ? '⛶' : '⛶';
        }
    }
}

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Document loaded, initializing...');
    window.homeController = new HomeController();
    if (SHOW_CONFIG.showId) {
        console.log('📺 URL has showId, starting directly:', SHOW_CONFIG.showId);
        const homeScreen = document.getElementById('home-screen');
        const playerScreen = document.getElementById('player-screen');
        if (homeScreen) {
            homeScreen.classList.remove('active');
            homeScreen.style.display = 'none';
        }
        if (playerScreen) {
            playerScreen.classList.add('active');
            playerScreen.style.display = 'block';
        }
        const config = {
            showId: SHOW_CONFIG.showId,
            startSeason: SHOW_CONFIG.startSeason || 1,
            startEpisode: SHOW_CONFIG.startEpisode || 1,
            introDuration: SHOW_CONFIG.introDuration || 90,
            outroDuration: SHOW_CONFIG.outroDuration || 30,
            nextEpisodeDelay: SHOW_CONFIG.nextEpisodeDelay || 5,
            showTitle: '',
            episodesPerSeason: {},
            cacheDuration: SHOW_CONFIG.cacheDuration || 3600000,
        };
        window.player = new SeriesPlayer(config);
    }
});