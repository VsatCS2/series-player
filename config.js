// ============================================
// CONFIGURATION - With Server Selection
// ============================================

const SHOW_CONFIG = {
    // Default values (will be overridden by user input)
    showId: null,
    startSeason: 1,
    startEpisode: 1,
    
    // Skip settings (in seconds)
    introDuration: 90,
    outroDuration: 30,
    nextEpisodeDelay: 5,
    
    showTitle: "",
    cacheDuration: 3600000, // 1 hour
    
    // Server Configuration
    defaultServer: 'vaplayer',
    servers: [
        { id: 'vaplayer', name: 'VAPlayer (Default)', url: 'https://vaplayer.ru' },
        { id: 'vidapi', name: 'VidAPI (Backup)', url: 'https://vidapi.ru' },
        { id: 'vplay', name: 'VPlay (Alternate)', url: 'https://vplay.to' },
        // Add more servers as they become available
    ]
};

// ============================================
// RECENT SHOWS MANAGEMENT
// ============================================

const RECENT_SHOWS_KEY = 'recent_shows';
const MAX_RECENT_SHOWS = 10;

function getRecentShows() {
    try {
        const data = localStorage.getItem(RECENT_SHOWS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function addRecentShow(showId, title, season, episode) {
    let recent = getRecentShows();
    
    recent = recent.filter(item => item.id !== showId);
    
    recent.unshift({
        id: showId,
        title: title || 'Unknown Show',
        season: season || 1,
        episode: episode || 1,
        lastWatched: Date.now(),
        timestamp: new Date().toLocaleDateString()
    });
    
    if (recent.length > MAX_RECENT_SHOWS) {
        recent = recent.slice(0, MAX_RECENT_SHOWS);
    }
    
    localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(recent));
    return recent;
}

function removeRecentShow(showId) {
    let recent = getRecentShows();
    recent = recent.filter(item => item.id !== showId);
    localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(recent));
    return recent;
}

function updateRecentShowProgress(showId, season, episode) {
    let recent = getRecentShows();
    const index = recent.findIndex(item => item.id === showId);
    if (index !== -1) {
        recent[index].season = season;
        recent[index].episode = episode;
        recent[index].lastWatched = Date.now();
        localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(recent));
    }
}

// ============================================
// SERVER MANAGEMENT
// ============================================

const SERVER_KEY = 'selected_server';

function getSelectedServer() {
    const saved = localStorage.getItem(SERVER_KEY);
    if (saved) {
        const server = SHOW_CONFIG.servers.find(s => s.id === saved);
        if (server) return server;
    }
    return SHOW_CONFIG.servers.find(s => s.id === SHOW_CONFIG.defaultServer) || SHOW_CONFIG.servers[0];
}

function setSelectedServer(serverId) {
    localStorage.setItem(SERVER_KEY, serverId);
}

function getServerUrl() {
    const server = getSelectedServer();
    return server.url;
}

function getServerId() {
    const server = getSelectedServer();
    return server.id;
}

// ============================================
// TMDB API Integration
// ============================================

// IMPORTANT: Replace with your own TMDB API key
// Get one at: https://www.themoviedb.org/signup
const TMDB_API_KEY = 'f7e83b50d1afa3be38487a330b4edbe9';

async function fetchShowData(showId, idType = 'auto') {
    // Check cache first
    const cacheKey = `show_data_${showId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            const cacheTime = data._cacheTime || 0;
            if (Date.now() - cacheTime < SHOW_CONFIG.cacheDuration) {
                console.log('📦 Using cached show data');
                return data;
            }
        } catch (e) {}
    }
    
    // Determine ID type
    if (idType === 'auto') {
        const idStr = String(showId);
        idType = idStr.startsWith('tt') ? 'imdb' : 'tmdb';
    }
    
    console.log(`🔍 Fetching show data via ${idType} ID: ${showId}`);
    
    try {
        let url;
        if (idType === 'imdb') {
            // Convert IMDB to TMDB first
            const findUrl = `https://api.themoviedb.org/3/find/${showId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
            const findResponse = await fetch(findUrl);
            if (!findResponse.ok) throw new Error('Failed to find show');
            const findData = await findResponse.json();
            
            if (!findData.tv_results || findData.tv_results.length === 0) {
                throw new Error('Show not found');
            }
            const tmdbId = findData.tv_results[0].id;
            url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=seasons`;
        } else {
            url = `https://api.themoviedb.org/3/tv/${showId}?api_key=${TMDB_API_KEY}&append_to_response=seasons`;
        }
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract episode counts per season
        const episodesPerSeason = {};
        let totalSeasons = 0;
        
        if (data.seasons) {
            data.seasons.forEach(season => {
                if (season.season_number > 0 && season.episode_count > 0) {
                    episodesPerSeason[season.season_number] = season.episode_count;
                    totalSeasons++;
                }
            });
        }
        
        const showData = {
            title: data.name || data.original_name || 'Unknown Show',
            tmdbId: data.id,
            imdbId: data.external_ids?.imdb_id || null,
            episodesPerSeason: episodesPerSeason,
            totalSeasons: totalSeasons,
            year: data.first_air_date ? new Date(data.first_air_date).getFullYear() : null,
            poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
            overview: data.overview || '',
            seasons: data.seasons || [],
            _cacheTime: Date.now(),
        };
        
        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify(showData));
        
        console.log(`✅ Found "${showData.title}" with ${totalSeasons} seasons`);
        return showData;
        
    } catch (error) {
        console.error('❌ Error fetching show data:', error);
        throw error;
    }
}

// ============================================
// URL PARAMETER PARSING (for direct links)
// ============================================

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        showId: params.get('id') || params.get('tmdb') || params.get('imdb') || null,
        season: params.get('season') ? parseInt(params.get('season')) : null,
        episode: params.get('episode') ? parseInt(params.get('episode')) : null,
        server: params.get('server') || null,
    };
}

// ============================================
// EXPORT
// ============================================

// Check for URL parameters on load
const urlParams = getUrlParams();
if (urlParams.showId) {
    SHOW_CONFIG.showId = urlParams.showId;
    if (urlParams.season) SHOW_CONFIG.startSeason = urlParams.season;
    if (urlParams.episode) SHOW_CONFIG.startEpisode = urlParams.episode;
    if (urlParams.server) {
        const server = SHOW_CONFIG.servers.find(s => s.id === urlParams.server);
        if (server) {
            SHOW_CONFIG.defaultServer = urlParams.server;
            setSelectedServer(urlParams.server);
        }
    }
}