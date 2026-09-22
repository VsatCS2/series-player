// ============================================
// CONFIGURATION
// ============================================

const SHOW_CONFIG = {
    showId: null,
    startSeason: 1,
    startEpisode: 1,
    introDuration: 90,
    outroDuration: 30,
    nextEpisodeDelay: 5,
    showTitle: "",
    cacheDuration: 3600000, // 1 hour
    includeSpecials: false,
};

// ============================================
// TMDB API
// ============================================
//
// ⚠️ SECURITY WARNING:
// This API key is exposed in client-side JavaScript. Anyone can steal it.
// For production, proxy TMDB calls through a serverless function
// (Cloudflare Workers, Vercel, Netlify Functions) and keep the key server-side.
//
// Example Cloudflare Worker:
//   export default { async fetch(req) {
//     const url = new URL(req.url);
//     const tmdbPath = url.searchParams.get('path');
//     const res = await fetch(`https://api.themoviedb.org/3${tmdbPath}`,
//       { headers: { Authorization: `Bearer ${TMDB_BEARER}` }});
//     return new Response(res.body, { headers: { 'Access-Control-Allow-Origin': '*' } });
//   }};
//
// Then call: fetch(`${PROXY_URL}?path=/tv/1399?append_to_response=seasons`)
// ============================================

const TMDB_API_KEY = 'f7e83b50d1afa3be38487a330b4edbe9';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// Simple in-memory request cache to avoid hammering the API
const _requestCache = new Map();
const _inFlight = new Map();

async function tmdbFetch(path, params = {}) {
    const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
    const url = `${TMDB_BASE}${path}?${query}`;

    if (_requestCache.has(url)) {
        const cached = _requestCache.get(url);
        if (Date.now() - cached.time < 60000) return cached.data;
    }
    if (_inFlight.has(url)) return _inFlight.get(url);

    const promise = (async () => {
        let attempt = 0;
        const maxRetries = 2;
        while (attempt <= maxRetries) {
            const res = await fetch(url);
            if (res.status === 429) {
                // Rate limited — wait and retry
                const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                attempt++;
                continue;
            }
            if (!res.ok) {
                throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            _requestCache.set(url, { time: Date.now(), data });
            return data;
        }
        throw new Error('TMDB API rate limited — try again shortly');
    })();

    _inFlight.set(url, promise);
    try {
        return await promise;
    } finally {
        _inFlight.delete(url);
    }
}

// ============================================
// SHOW DATA FETCHING
// ============================================

async function fetchShowData(showId, idType = 'auto') {
    const cacheKey = `show_data_${showId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            if (Date.now() - (data._cacheTime || 0) < SHOW_CONFIG.cacheDuration) {
                console.log('📦 Using cached show data');
                return data;
            }
        } catch (e) { /* ignore corrupt cache */ }
    }

    if (idType === 'auto') {
        idType = String(showId).startsWith('tt') ? 'imdb' : 'tmdb';
    }

    console.log(`🔍 Fetching show data via ${idType} ID: ${showId}`);

    let tmdbId = showId;

    if (idType === 'imdb') {
        const findData = await tmdbFetch(`/find/${showId}`, { external_source: 'imdb_id' });
        if (!findData.tv_results?.length) {
            // Maybe it's a movie — try movie results too
            if (findData.movie_results?.length) {
                throw new Error('This ID is a movie, not a TV show');
            }
            throw new Error('Show not found');
        }
        tmdbId = findData.tv_results[0].id;
    }

    const data = await tmdbFetch(`/tv/${tmdbId}`, { append_to_response: 'seasons' });

    const episodesPerSeason = {};
    data.seasons?.forEach(season => {
        const isValid = SHOW_CONFIG.includeSpecials
            ? season.episode_count > 0
            : season.season_number > 0 && season.episode_count > 0;
        if (isValid) {
            episodesPerSeason[season.season_number] = season.episode_count;
        }
    });

    const showData = {
        title: data.name || data.original_name || 'Unknown Show',
        tmdbId: data.id,
        imdbId: showId.startsWith('tt') ? showId : null,
        episodesPerSeason,
        totalSeasons: Object.keys(episodesPerSeason).length,
        year: data.first_air_date ? new Date(data.first_air_date).getFullYear() : null,
        poster: data.poster_path ? `${TMDB_IMG}/w500${data.poster_path}` : null,
        overview: data.overview || '',
        seasons: data.seasons || [],
        _cacheTime: Date.now(),
    };

    try {
        localStorage.setItem(cacheKey, JSON.stringify(showData));
    } catch (e) {
        console.warn('Failed to cache show data (storage full?)');
    }
    console.log(`✅ Found "${showData.title}" — ${showData.totalSeasons} seasons`);
    return showData;
}

// ============================================
// FETCH EPISODE TITLES (per-season)
// ============================================

async function fetchEpisodeTitles(tmdbId, seasons) {
    const titles = {};
    await Promise.all(seasons.map(async seasonNumber => {
        try {
            const data = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`);
            (data.episodes || []).forEach(ep => {
                titles[`${seasonNumber}_${ep.episode_number}`] = ep.name || '';
            });
        } catch (e) {
            console.warn(`Failed to fetch S${seasonNumber} episode titles:`, e.message);
        }
    }));
    return titles;
}

// ============================================
// SEARCH SHOWS BY NAME
// ============================================

async function searchShows(query) {
    const data = await tmdbFetch('/search/tv', { query, include_adult: 'false' });
    return (data.results || []).slice(0, 12).map(item => ({
        id: String(item.id),
        title: item.name || item.original_name || 'Unknown',
        year: item.first_air_date ? new Date(item.first_air_date).getFullYear() : null,
        poster: item.poster_path ? `${TMDB_IMG}/w300${item.poster_path}` : null,
        overview: item.overview || '',
    }));
}

// ============================================
// RECENT SHOWS MANAGEMENT
// ============================================

const RECENT_SHOWS_KEY = 'recent_shows';
const MAX_RECENT_SHOWS = 10;

function getRecentShows() {
    try {
        const data = localStorage.getItem(RECENT_SHOWS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function addRecentShow(showId, title, season, episode) {
    let recent = getRecentShows();
    const existing = recent.find(item => item.id === showId);
    // Skip write if already at the top with same data
    if (existing && recent[0]?.id === showId && existing.season === season && existing.episode === episode) {
        return recent;
    }
    recent = recent.filter(item => item.id !== showId);
    recent.unshift({
        id: showId,
        title: title || 'Unknown Show',
        season: season || 1,
        episode: episode || 1,
        lastWatched: Date.now(),
        timestamp: new Date().toLocaleDateString(),
    });
    if (recent.length > MAX_RECENT_SHOWS) recent = recent.slice(0, MAX_RECENT_SHOWS);
    try { localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(recent)); } catch (e) {}
    return recent;
}

function removeRecentShow(showId) {
    let recent = getRecentShows().filter(item => item.id !== showId);
    try { localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(recent)); } catch (e) {}
    return recent;
}

function updateRecentShowProgress(showId, season, episode) {
    const recent = getRecentShows();
    const index = recent.findIndex(item => item.id === showId);
    if (index === -1) return;
    recent[index].season = season;
    recent[index].episode = episode;
    recent[index].lastWatched = Date.now();
    try { localStorage.setItem(RECENT_SHOWS_KEY, JSON.stringify(recent)); } catch (e) {}
}

// ============================================
// CONTINUE WATCHING
// ============================================

const CONTINUE_WATCHING_KEY = 'continue_watching';
const MAX_CONTINUE = 10;

function getContinueWatching() {
    try {
        const data = localStorage.getItem(CONTINUE_WATCHING_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function removeContinueWatching(showId) {
    const items = getContinueWatching().filter(item => item.id !== showId);
    try { localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(items)); } catch (e) {}
    return items;
}

function updateContinueWatching(showId, season, episode, progress, duration) {
    let items = getContinueWatching();
    const existing = items.find(item => item.id === showId);
    const recent = getRecentShows();
    const show = recent.find(item => item.id === showId);

    if (existing) {
        existing.season = season;
        existing.episode = episode;
        existing.progress = progress;
        existing.duration = duration;
        existing.lastWatched = Date.now();
        items = items.filter(item => item.id !== showId);
        items.unshift(existing);
    } else {
        items.unshift({
            id: showId,
            title: show?.title || 'Unknown Show',
            season,
            episode,
            progress: progress || 0,
            duration: duration || 0,
            lastWatched: Date.now(),
        });
    }
    if (items.length > MAX_CONTINUE) items = items.slice(0, MAX_CONTINUE);
    try { localStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(items)); } catch (e) {}
    return items;
}

// ============================================
// URL PARAMETER PARSING (cached)
// ============================================

let _urlParamsCache = null;
function getUrlParams() {
    if (_urlParamsCache) return _urlParamsCache;
    const params = new URLSearchParams(window.location.search);
    _urlParamsCache = {
        showId: params.get('id') || params.get('tmdb') || params.get('imdb') || null,
        season: params.get('season') ? parseInt(params.get('season'), 10) : null,
        episode: params.get('episode') ? parseInt(params.get('episode'), 10) : null,
    };
    return _urlParamsCache;
}

// ============================================
// STORAGE HELPERS
// ============================================

function clearAllAppData() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
            key.startsWith('progress_') ||
            key.startsWith('duration_') ||
            key.startsWith('show_data_') ||
            key === RECENT_SHOWS_KEY ||
            key === CONTINUE_WATCHING_KEY ||
            key === 'player_speed' ||
            key === 'player_volume' ||
            key === 'theme'
        )) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
}

function getAppStorageSize() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('progress_') || key.startsWith('duration_') || key.startsWith('show_data_'))) {
            total += (localStorage.getItem(key) || '').length;
        }
    }
    return total;
}