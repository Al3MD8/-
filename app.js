// ==========================================================================
// CONFIGURATION (الإعدادات)
// أضف أرقام الأنميات (MAL IDs) التي تأكدت من عمل سيرفراتها هنا:
// ==========================================================================
const VERIFIED_ANIME_IDS = [
  21,      // One Piece
  1735,    // Naruto: Shippuuden
  31964,   // Boku no Hero Academia
  52991,   // Sousou no Frieren
  11061,   // Hunter x Hunter (2011)
  5114,    // Fullmetal Alchemist: Brotherhood
  38000,   // Kimetsu no Yaiba
  16498,   // Shingeki no Kyojin
  30276,   // One Punch Man
  40748    // Jujutsu Kaisen
];

// ==========================================================================
// APP STATE ENGINE & API INTEGRATION (إدارة حالة التطبيق وربط الواجهات)
// ==========================================================================
const state = {
  savedAnimeIds: [], // مصفوفة لحفظ معرفات (IDs) الأنمي
  savedAnimesData: [], // مصفوفة لحفظ البيانات الكاملة للأنميات المحفوظة
  activeAnime: null, 
  activeEpisodeIndex: 0, 
  activeServerIndex: 0, 
  currentGenreFilter: 'all', 
  searchQuery: '',
  seasonalAnime: [],
  popularAnime: []
};

const userState = {
  isLoggedIn: false,
  username: "",
  avatar: "",
  selectedAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Luffy"
};

// API Configuration - Jikan API (MyAnimeList)
const API_BASE = "https://api.jikan.moe/v4";

// ==========================================================================
// WITANIME CORE SCRAPER & DECRYPTOR (مستخرج وفك تشفير سيرفرات وايت أنمي)
// ==========================================================================
function decryptWitanimeEpisodes(data) {
  try {
    const parts = data.split('.');
    const rawData = atob(parts[0]);
    const key = atob(parts[1]);
    let decrypted = '';
    for (let i = 0; i < rawData.length; i++) {
      const charCode = rawData.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      decrypted += String.fromCharCode(charCode);
    }
    return JSON.parse(decrypted);
  } catch (e) {
    console.error("Witanime XOR Decryption failed:", e);
    return [];
  }
}

function decryptWitanimeServer(resourceData, configSettings) {
  try {
    let rev = resourceData.split('').reverse().join('');
    let clean = rev.replace(/[^A-Za-z0-9+/=]/g, '');
    const indexKey = atob(configSettings.k);
    const paramOffset = configSettings.d[parseInt(indexKey, 10)];
    let decoded = atob(clean);
    let sliced = decoded.slice(0, -paramOffset);
    
    const FRAMEWORK_HASH = "23a97133-caf3-4eb4-9466-93d0a4ff8198";
    if (/^https:\/\/yonaplay\.net\/embed\.php\?id=\d+$/.test(sliced)) {
      sliced = sliced + "&apiKey=" + FRAMEWORK_HASH;
    }
    return sliced;
  } catch (e) {
    console.error("Witanime Server Decryption failed:", e);
    return "";
  }
}

async function getWitanimeEpisodes(anime) {
  const searchTitles = [];
  if (anime.title) searchTitles.push(anime.title);
  if (anime.title_english) searchTitles.push(anime.title_english);
  if (anime.title_japanese) searchTitles.push(anime.title_japanese);

  for (const title of searchTitles) {
    try {
      const searchUrl = `https://witanime.you/?search_param=animes&s=${encodeURIComponent(title)}`;
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`);
      if (!response.ok) continue;
      
      const data = await response.json();
      const html = data.contents;
      const regex = /<a\s+href="(https:\/\/witanime\.you\/anime\/[^"]+)"\s+class="overlay"><\/a>/i;
      const match = html.match(regex);
      if (match && match[1]) {
        const animeUrl = match[1];
        
        const animeRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(animeUrl)}`);
        if (!animeRes.ok) continue;
        
        const animeData = await animeRes.json();
        const animeHtml = animeData.contents;
        const epDataMatch = animeHtml.match(/var\s+processedEpisodeData\s*=\s*'([^']+)';/);
        if (epDataMatch && epDataMatch[1]) {
          const decryptedEpisodes = decryptWitanimeEpisodes(epDataMatch[1]);
          if (decryptedEpisodes && decryptedEpisodes.length > 0) {
            const firstNum = parseInt(decryptedEpisodes[0].number);
            const lastNum = parseInt(decryptedEpisodes[decryptedEpisodes.length - 1].number);
            if (firstNum > lastNum) {
              decryptedEpisodes.reverse();
            }
            return decryptedEpisodes;
          }
        }
      }
    } catch (e) {
      console.warn(`Witanime extraction failed for title "${title}":`, e);
    }
  }
  return null;
}

// Consumet API Configuration (Multi-instance fallback)
const CONSUMET_BASES = [
  "https://api-consumet.vercel.app",
  "https://consumet-api-v2.vercel.app",
  "https://api.consumet.org"
];

async function fetchFromConsumet(path) {
  for (const base of CONSUMET_BASES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      
      const res = await fetch(`${base}${path}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Failed to fetch from Consumet base ${base}:`, e);
    }
  }
  throw new Error("All Consumet API instances failed");
}

// دالة لجلب معرف AniList من معرف MyAnimeList عبر GraphQL الرسمي لمنع الأخطاء في السيرفرات الأخرى
async function getAnilistId(malId) {
  try {
    const query = `
      query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
          id
        }
      }
    `;
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        variables: { idMal: malId }
      })
    });
    if (response.ok) {
      const result = await response.json();
      return result.data?.Media?.id || null;
    }
  } catch (e) {
    console.error("Failed to map MAL ID to AniList ID via AniList GraphQL:", e);
  }
  return null;
}

async function getGogoanimeId(anime) {
  let gogoSlug = "";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const malSyncRes = await fetch(`https://api.malsync.moe/mal/anime/${anime.mal_id}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (malSyncRes.ok) {
      const malData = await malSyncRes.json();
      if (malData.Sites) {
        if (malData.Sites.Gogoanime) {
          const gogoKeys = Object.keys(malData.Sites.Gogoanime);
          if (gogoKeys.length > 0) {
            gogoSlug = malData.Sites.Gogoanime[gogoKeys[0]].identifier;
          }
        }
        if (!gogoSlug && malData.Sites.Zoro) {
          const zoroKeys = Object.keys(malData.Sites.Zoro);
          if (zoroKeys.length > 0) {
            gogoSlug = malData.Sites.Zoro[zoroKeys[0]].identifier;
          }
        }
      }
    }
  } catch (e) {
    console.warn("MalSync fetch failed:", e);
  }

  if (gogoSlug) return gogoSlug;

  // Fallback to Consumet Search
  try {
    const searchResults = await fetchFromConsumet(`/anime/gogoanime/${encodeURIComponent(anime.title)}`);
    if (searchResults && searchResults.results && searchResults.results.length > 0) {
      return searchResults.results[0].id;
    }
  } catch (e) {
    console.warn("Consumet search failed:", e);
  }

  // Final fallback guess: Jikan's main title is Romaji (Japanese in English characters), 
  // which matches Gogoanime's database perfectly!
  return anime.title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ==========================================================================
// DOM ELEMENT SELECTORS
// ==========================================================================
const DOM = {
  header: document.querySelector('.header'),
  logoLink: document.getElementById('logoLink'),
  navLinks: document.querySelectorAll('.nav-link'),
  savedBadge: document.getElementById('savedBadge'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),

  seasonalGrid: document.getElementById('seasonalGrid'),
  allAnimeGrid: document.getElementById('allAnimeGrid'),
  savedGrid: document.getElementById('savedGrid'),
  allAnimeSubtitle: document.getElementById('allAnimeSubtitle'),

  heroBanner: document.getElementById('heroBanner'),
  heroSeason: document.getElementById('heroSeason'),
  heroTitle: document.getElementById('heroTitle'),
  heroDesc: document.getElementById('heroDesc'),
  heroRating: document.getElementById('heroRating'),
  heroType: document.getElementById('heroType'),
  heroEpisodes: document.getElementById('heroEpisodes'),
  heroPlayBtn: document.getElementById('heroPlayBtn'),
  heroSaveBtn: document.getElementById('heroSaveBtn'),

  filterBtns: document.querySelectorAll('.filter-btn'),

  animeModal: document.getElementById('animeModal'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  modalBanner: document.getElementById('modalBanner'),
  modalTitle: document.getElementById('modalTitle'),
  modalSubTitle: document.getElementById('modalSubTitle'),
  modalRating: document.getElementById('modalRating'),
  modalSeason: document.getElementById('modalSeason'),
  modalStatus: document.getElementById('modalStatus'),
  modalType: document.getElementById('modalType'),
  modalDesc: document.getElementById('modalDesc'),
  modalGenres: document.getElementById('modalGenres'),
  modalSaveBtn: document.getElementById('modalSaveBtn'),
  episodesGrid: document.getElementById('episodesGrid'),
  episodesCountText: document.getElementById('episodesCountText'),

  videoIframe: document.getElementById('videoIframe'),
  serversButtons: document.getElementById('serversButtons'),
  activeEpTitleBottom: document.getElementById('activeEpTitleBottom'),
  nextEpisodeBtn: document.getElementById('nextEpisodeBtn'),
  playerLoading: document.getElementById('playerLoading'),
  playerArea: document.getElementById('playerArea'),
  serversOverlay: document.getElementById('serversOverlay'),
  qualityBadgesOverlay: document.getElementById('qualityBadgesOverlay'),
  videoWrapper: document.getElementById('videoWrapper'),
  modalDate: document.getElementById('modalDate'),
  playerServersBar: document.getElementById('playerServersBar'),
  backToServersBtn: document.getElementById('backToServersBtn'),

  toast: document.getElementById('toast'),
  toastText: document.getElementById('toastText'),

  // New Sidebar and Profile Auth Selectors
  sidebarDrawer: document.getElementById('sidebarDrawer'),
  sidebarDrawerOverlay: document.getElementById('sidebarDrawerOverlay'),
  sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  headerProfileBtn: document.getElementById('headerProfileBtn'),
  headerAvatar: document.getElementById('headerAvatar'),
  sidebarProfileCard: document.getElementById('sidebarProfileCard'),
  sidebarSavedBadge: document.getElementById('sidebarSavedBadge'),
  sidebarNavLinks: document.querySelectorAll('.sidebar-nav-link'),

  authModal: document.getElementById('authModal'),
  authModalBackdrop: document.getElementById('authModalBackdrop'),
  authModalCloseBtn: document.getElementById('authModalCloseBtn'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  usernameInput: document.getElementById('usernameInput'),
  avatarOptionImgs: document.querySelectorAll('.avatar-option-img'),
  customAvatarFile: document.getElementById('customAvatarFile'),
  customAvatarName: document.getElementById('customAvatarName'),
  mobileLinks: document.querySelectorAll('.mobile-link')
};

// ==========================================================================
// CORE INITIALIZER
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initUserProfile(); // New user profile initializer - Call this first!
  loadSavedListFromStorage(); // Now this will load the correct account-specific saved list
  registerEventListeners();
  initAudioBoost();
  
  // Show loading states
  DOM.seasonalGrid.innerHTML = '<div class="spinner" style="margin: 50px auto;"></div>';
  DOM.allAnimeGrid.innerHTML = '<div class="spinner" style="margin: 50px auto;"></div>';
  
  // Fetch Data from Jikan API (loads instantly from cache)
  await fetchAPIAnime();
});

// ==========================================================================
// API FETCH LOGIC WITH INSTANT CACHING (نظام الكاش فائق السرعة لمنع البطء والتعليق)
// ==========================================================================
async function fetchAPIAnime() {
  const CACHE_KEY = "verified_anime_cache_v3";
  const CACHE_TIME_KEY = "verified_anime_cache_time_v3";

  let cachedAnime = [];
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) cachedAnime = JSON.parse(cachedData);
  } catch(e) {}

  // Filter out any cached anime that are NO LONGER in the VERIFIED list
  cachedAnime = cachedAnime.filter(a => VERIFIED_ANIME_IDS.includes(a.mal_id));

  // Determine which anime IDs are missing from the cache
  const cachedIds = cachedAnime.map(a => a.mal_id);
  const missingIds = VERIFIED_ANIME_IDS.filter(id => !cachedIds.includes(id));

  // Sort initially by ID or title
  state.popularAnime = [...cachedAnime];
  state.seasonalAnime = [...cachedAnime].reverse();

  // Render what we have instantly
  renderAllContent();

  if (missingIds.length > 0) {
    console.log(`Fetching ${missingIds.length} missing verified animes...`);
    
    // Show a small loading indicator
    if (typeof showToast === 'function') {
      showToast("جاري تحميل بيانات الأنميات الجديدة... ⏳");
    }

    const newlyFetched = [];
    for (const id of missingIds) {
      try {
        const res = await fetch(`${API_BASE}/anime/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.data) newlyFetched.push(data.data);
        }
        // Delay to avoid Jikan rate limit (3 req/sec)
        await new Promise(resolve => setTimeout(resolve, 400));
      } catch (e) {
         console.warn(`Failed to fetch anime ${id}`, e);
      }
    }

    if (newlyFetched.length > 0) {
      const allAnime = [...cachedAnime, ...newlyFetched];
      localStorage.setItem(CACHE_KEY, JSON.stringify(allAnime));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      
      state.popularAnime = [...allAnime];
      state.seasonalAnime = [...allAnime].reverse();
      renderAllContent();
      
      if (typeof showToast === 'function') {
        showToast("اكتمل تحميل الأنميات بنجاح! ✅");
      }
    }
  }
}

function renderAllContent() {
  renderHeroBanner();
  renderWatchHistoryGrid();
  renderLatestEpisodes();
  renderSeasonalAnime();
  renderAllAnime();
  renderSavedAnime();
}

async function fetchAnimeEpisodes(id) {
  try {
    const res = await fetch(`${API_BASE}/anime/${id}/episodes`);
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error("Failed to fetch episodes", e);
    return [];
  }
}

// ==========================================================================
// LOCAL STORAGE SYSTEM
// ==========================================================================
function loadSavedListFromStorage() {
  try {
    const suffix = (typeof userState !== 'undefined' && userState.isLoggedIn && userState.username) ? `_${userState.username}` : '';
    const storedIds = localStorage.getItem('savedAnimeIds' + suffix);
    const storedData = localStorage.getItem('savedAnimesData' + suffix);
    state.savedAnimeIds = storedIds ? JSON.parse(storedIds) : [];
    state.savedAnimesData = storedData ? JSON.parse(storedData) : [];
  } catch (e) {
    console.warn("LocalStorage is not available.", e);
  }
  updateSavedBadge();
}

function saveListToStorage() {
  try {
    const suffix = (typeof userState !== 'undefined' && userState.isLoggedIn && userState.username) ? `_${userState.username}` : '';
    localStorage.setItem('savedAnimeIds' + suffix, JSON.stringify(state.savedAnimeIds));
    localStorage.setItem('savedAnimesData' + suffix, JSON.stringify(state.savedAnimesData));
  } catch (e) {
    console.warn("LocalStorage saving is not available.", e);
  }
  updateSavedBadge();
}

function updateSavedBadge() {
  const count = state.savedAnimeIds.length;
  if (DOM.savedBadge) {
    DOM.savedBadge.textContent = count;
    if (count > 0) {
      DOM.savedBadge.style.transform = 'scale(1.2)';
      setTimeout(() => DOM.savedBadge.style.transform = 'scale(1)', 200);
    }
  }
  if (DOM.sidebarSavedBadge) {
    DOM.sidebarSavedBadge.textContent = count;
  }
}

function toggleBookmark(anime) {
  const index = state.savedAnimeIds.indexOf(anime.mal_id);
  let saved = false;

  if (index === -1) {
    state.savedAnimeIds.push(anime.mal_id);
    state.savedAnimesData.push(anime);
    saved = true;
    showToast("تم إضافة الأنمي إلى قائمتك المحفوظة ❤️");
  } else {
    state.savedAnimeIds.splice(index, 1);
    state.savedAnimesData = state.savedAnimesData.filter(a => a.mal_id !== anime.mal_id);
    saved = false;
    showToast("تم إزالة الأنمي من قائمتك المحفوظة 💔");
  }

  saveListToStorage();
  
  renderSavedAnime();
  updateCardBookmarkStates();
  updateHeroBookmarkState();
  updateModalBookmarkState();

  return saved;
}

// ==========================================================================
// RENDER HELPERS
// ==========================================================================
function getAnimeDataObj(mal_id) {
  return state.popularAnime.find(a => a.mal_id == mal_id) || 
         state.seasonalAnime.find(a => a.mal_id == mal_id) || 
         state.savedAnimesData.find(a => a.mal_id == mal_id);
}

function createAnimeCardHTML(anime) {
  const isSaved = state.savedAnimeIds.includes(anime.mal_id);
  const saveIconClass = isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
  const saveBtnSavedClass = isSaved ? 'saved' : '';
  const statusText = anime.status === 'Currently Airing' ? 'يعرض الان' : (anime.status === 'Not yet aired' ? 'قريباً' : 'مكتمل');
  
  const poster = anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || 'https://via.placeholder.com/300x400?text=No+Image';

  return `
    <article class="anime-card" data-id="${anime.mal_id}">
      <div class="card-img-wrapper" onclick="openAnimeDetails(${anime.mal_id})">
        <img src="${poster}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
        <div class="anime-card-overlay">
           <div class="anime-card-info-icon"><i class="fa-solid fa-info"></i></div>
        </div>
        <div class="card-overlays">
          <div class="card-top-badges">
            <span class="card-badge badge-season" style="background: rgba(0,0,0,0.8);">${statusText}</span>
            <button class="card-save-btn ${saveBtnSavedClass}" data-id="${anime.mal_id}" aria-label="حفظ الأنمي" onclick="event.stopPropagation(); toggleBookmark(getAnimeDataObj(${anime.mal_id}))">
              <i class="${saveIconClass}"></i>
            </button>
          </div>
          <span class="card-badge badge-season" style="background: var(--gold); color: black;">${anime.type || 'TV'}</span>
        </div>
      </div>
      <div class="card-info" style="padding: 12px; text-align: center;">
        <h3 class="card-title" onclick="openAnimeDetails(${anime.mal_id})" style="font-size: 0.95rem; margin-bottom: 0;">${anime.title}</h3>
      </div>
    </article>
  `;
}

function renderHeroBanner() {
  const featured = state.seasonalAnime.length > 0 ? state.seasonalAnime[0] : state.popularAnime[0];
  if (!featured) return;

  const poster = featured.trailer?.images?.maximum_image_url || featured.images?.webp?.large_image_url;
  DOM.heroBanner.style.backgroundImage = `url('${poster}')`;
  DOM.heroSeason.textContent = featured.season ? `${featured.season} ${featured.year}` : featured.type;
  DOM.heroTitle.textContent = featured.title_english || featured.title;
  DOM.heroDesc.textContent = featured.synopsis ? featured.synopsis.substring(0, 200) + '...' : 'لا يوجد وصف متاح.';
  DOM.heroRating.textContent = featured.score || 'N/A';
  DOM.heroType.textContent = featured.type;
  DOM.heroEpisodes.textContent = `${featured.episodes || '?'} حلقة`;

  DOM.heroPlayBtn.onclick = () => openAnimeModal(featured.mal_id);
  DOM.heroSaveBtn.onclick = () => toggleBookmark(featured);

  updateHeroBookmarkState();
}

function updateHeroBookmarkState() {
  const featured = state.seasonalAnime.length > 0 ? state.seasonalAnime[0] : state.popularAnime[0];
  if (!featured) return;

  const isSaved = state.savedAnimeIds.includes(featured.mal_id);
  if (isSaved) {
    DOM.heroSaveBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> محفوظ في قائمتك`;
    DOM.heroSaveBtn.classList.add('btn-primary');
    DOM.heroSaveBtn.classList.remove('btn-secondary');
  } else {
    DOM.heroSaveBtn.innerHTML = `<i class="fa-regular fa-bookmark"></i> حفظ في المفضلة`;
    DOM.heroSaveBtn.classList.add('btn-secondary');
    DOM.heroSaveBtn.classList.remove('btn-primary');
  }
}

function renderSeasonalAnime() {
  if (state.seasonalAnime.length === 0) return;
  DOM.seasonalGrid.innerHTML = state.seasonalAnime.slice(0, 12).map(a => createAnimeCardHTML(a)).join('');
  attachCardSaveEvents(DOM.seasonalGrid);
}

function renderAllAnime() {
  let filtered = [...state.popularAnime];

  if (state.searchQuery.trim() !== '') {
    const query = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(a => 
      a.title.toLowerCase().includes(query) || 
      (a.title_english && a.title_english.toLowerCase().includes(query))
    );
  }

  if (state.currentGenreFilter !== 'all') {
    filtered = filtered.filter(a => a.genres.some(g => g.name === state.currentGenreFilter));
  }

  if (filtered.length === 0) {
    DOM.allAnimeGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-icon"></i>
        <h3>لم نعثر على أي نتائج!</h3>
      </div>
    `;
    return;
  }

  DOM.allAnimeGrid.innerHTML = filtered.map(a => createAnimeCardHTML(a)).join('');
  attachCardSaveEvents(DOM.allAnimeGrid);
}

function renderSavedAnime() {
  const savedSection = document.getElementById('saved');
  if (DOM.savedBadge) DOM.savedBadge.textContent = state.savedAnimeIds.length;
  if (DOM.sidebarSavedBadge) DOM.sidebarSavedBadge.textContent = state.savedAnimeIds.length;
  
  if (!savedSection) return;

  if (state.savedAnimesData.length === 0) {
    savedSection.style.display = 'none';
    return;
  }
  
  savedSection.style.display = 'block';
  DOM.savedGrid.innerHTML = state.savedAnimesData.map(a => createAnimeCardHTML(a)).join('');
  attachCardSaveEvents(DOM.savedGrid);
  
  // Update stats if logged in
  const statSavedCount = document.getElementById('statSavedCount');
  if (statSavedCount) statSavedCount.textContent = state.savedAnimeIds.length;
}

function updateCardBookmarkStates() {
  const allSaveButtons = document.querySelectorAll('.card-save-btn');
  allSaveButtons.forEach(btn => {
    const id = parseInt(btn.getAttribute('data-id'));
    const isSaved = state.savedAnimeIds.includes(id);
    const icon = btn.querySelector('i');
    if (isSaved) {
      btn.classList.add('saved');
      if (icon) icon.className = 'fa-solid fa-bookmark';
    } else {
      btn.classList.remove('saved');
      if (icon) icon.className = 'fa-regular fa-bookmark';
    }
  });
}

function attachCardSaveEvents(parentGrid) {
  const saveBtns = parentGrid.querySelectorAll('.card-save-btn');
  saveBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = parseInt(btn.getAttribute('data-id'));
      const anime = getAnimeDataObj(id);
      if (anime) toggleBookmark(anime);
    };
  });
}

// ==========================================================================
// CINEMATIC MODAL & STREAMING MEDIA PLAYER
// ==========================================================================
window.openAnimeModal = async function(animeId) {
  const anime = getAnimeDataObj(animeId);
  if (!anime) return;

  state.activeAnime = anime;
  state.activeEpisodeIndex = 0;
  state.activeServerIndex = 0;
  state.activeQuality = 'fhd'; // Default quality

  DOM.modalTitle.textContent = anime.title_english || anime.title;
  
  const banner = anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url || 'https://via.placeholder.com/300x400';
  DOM.modalBanner.style.backgroundImage = `url('${banner}')`;
  const bgBlurred = document.getElementById('modalBgBlurred');
  if (bgBlurred) {
    bgBlurred.style.backgroundImage = `url('${banner}')`;
  }
  DOM.modalRating.innerHTML = `${anime.score || 'N/A'}`;
  DOM.modalSeason.textContent = anime.season ? `${anime.season} ${anime.year}` : anime.type;
  DOM.modalStatus.textContent = anime.status === 'Currently Airing' ? 'مستمر' : 'مكتمل';
  DOM.modalDesc.textContent = anime.synopsis || 'لا يوجد قصة متوفرة لهذا الأنمي حالياً.';
  DOM.modalGenres.innerHTML = anime.genres.map(g => `<span class="meta-tag">${g.name}</span>`).join('');
  
  if (DOM.modalDate) {
    const today = new Date();
    DOM.modalDate.textContent = today.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  updateModalBookmarkState();

  DOM.animeModal.classList.add('active');
  document.body.style.overflow = 'hidden';

  DOM.episodesGrid.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  
  // جلب الحلقات ومعرف AniList بالتوازي لتوفير الوقت وسرعة الاستجابة
  const [witanimeEpisodes, episodesResult, anilistIdResult] = await Promise.all([
    getWitanimeEpisodes(anime),
    fetchAnimeEpisodes(anime.mal_id),
    state.activeAnime.anilistId ? Promise.resolve(state.activeAnime.anilistId) : getAnilistId(anime.mal_id)
  ]);
  
  state.activeAnime.anilistId = anilistIdResult;
  let episodes = witanimeEpisodes || episodesResult;
  
  // نظام احتياطي قوي وسليم: لا نقوم بتوليد حلقات مستقبلية غير معروضة بعد للأنميات المستمرة!
  const totalEpisodes = anime.episodes || 0;
  const isAiring = anime.status === 'Currently Airing' || anime.status === 'Not yet aired';
  
  if (episodes.length === 0 && totalEpisodes > 0) {
    // إذا فشل الاتصال وجلب الحلقات وكان الأنمي مكتملاً، نولدها كلها. أما إن كان مستمراً نكتفي بالحلقة الأولى كبداية
    const countToGenerate = isAiring ? 1 : totalEpisodes;
    episodes = Array.from({ length: countToGenerate }, (_, i) => ({
      mal_id: i + 1,
      title: `الحلقة ${i + 1}`
    }));
  } else if (totalEpisodes > episodes.length && !isAiring) {
    // نقوم بتوليد بقية الحلقات تلقائياً فقط إذا كان الأنمي مكتمل العرض (Finished Airing)
    // لتلافي ظهور أزرار فارغة لا تعمل للحلقات التي لم تصدر بعد في الأنميات المستمرة!
    for (let i = episodes.length; i < totalEpisodes; i++) {
      episodes.push({
        mal_id: i + 1,
        title: `الحلقة ${i + 1}`
      });
    }
  }

  // إذا كانت القائمة لا تزال فارغة تماماً
  if (episodes.length === 0) {
    const fallbackCount = isAiring ? 1 : 12;
    episodes = Array.from({ length: fallbackCount }, (_, i) => ({
      mal_id: i + 1,
      title: `الحلقة ${i + 1}`
    }));
  }
  
  state.activeAnime.fetchedEpisodes = episodes;
  
  renderModalEpisodes();
  loadActiveEpisodePlayback();
}

function closeAnimeModal() {
  DOM.animeModal.classList.remove('active');
  document.body.style.overflow = '';
  DOM.videoIframe.src = ""; 
  state.activeAnime = null;
}

function updateModalBookmarkState() {
  if (!state.activeAnime || !DOM.modalSaveBtn) return;
  const isSaved = state.savedAnimeIds.includes(state.activeAnime.mal_id);
  if (isSaved) {
    DOM.modalSaveBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> محفوظ`;
    DOM.modalSaveBtn.classList.add('saved');
  } else {
    DOM.modalSaveBtn.innerHTML = `<i class="fa-regular fa-bookmark"></i> حفظ`;
    DOM.modalSaveBtn.classList.remove('saved');
  }
}

function renderModalEpisodes() {
  const episodes = state.activeAnime.fetchedEpisodes;
  if(DOM.episodesCountText) DOM.episodesCountText.textContent = episodes.length;
  
  DOM.episodesGrid.innerHTML = episodes.map((ep, idx) => {
    const activeClass = idx === state.activeEpisodeIndex ? 'active' : '';
    return `
      <button class="ep-num-btn ${activeClass}" onclick="changeEpisode(${idx})">
        ${idx + 1}
      </button>
    `;
  }).join('');
}

let hlsInstance = null;

async function loadActiveEpisodePlayback() {
  const episodes = state.activeAnime.fetchedEpisodes;
  if (!episodes || episodes.length === 0) return;

  const episode = episodes[state.activeEpisodeIndex];
  if(DOM.activeEpTitleBottom) DOM.activeEpTitleBottom.textContent = `${state.activeAnime.title_english || state.activeAnime.title} - الحلقة ${state.activeEpisodeIndex + 1}`;

  // Save Watch History log entry
  if (state.activeAnime) {
    saveWatchHistoryItem(state.activeAnime, state.activeEpisodeIndex);
  }

  // Show loading spinner
  if(DOM.serversButtons) {
    DOM.serversButtons.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  }
  if(DOM.playerServersBar) {
    DOM.playerServersBar.innerHTML = '';
  }

  // Highlight quality circle selection
  const btnFHD = document.getElementById('btnFHD');
  const btnHD = document.getElementById('btnHD');
  if (btnFHD && btnHD) {
    btnFHD.classList.toggle('active', state.activeQuality === 'fhd');
    btnHD.classList.toggle('active', state.activeQuality === 'hd');
  }

  const epNum = state.activeEpisodeIndex + 1;
  let gogoSlug = await getGogoanimeId(state.activeAnime);

  let streamingServers = [];

  // 1. Try to load and decrypt real Witanime servers if available
  if (episode.url && episode.url.includes("witanime")) {
    try {
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(episode.url)}`);
      if (response.ok) {
        const data = await response.json();
        const episodeHtml = data.contents;
        const zG_match = episodeHtml.match(/var _zG\s*=\s*"([^"]+)";/);
        const zH_match = episodeHtml.match(/var _zH\s*=\s*"([^"]+)";/);
        
        if (zG_match && zH_match) {
          const zG = JSON.parse(atob(zG_match[1]));
          const zH = JSON.parse(atob(zH_match[1]));
          
          let match;
          const serverRegex = /data-server-id="(\d+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/g;
          const witanimeAllServers = [];
          
          while ((match = serverRegex.exec(episodeHtml)) !== null) {
            const serverId = parseInt(match[1]);
            const serverName = match[2].trim();
            const resourceData = zG[serverId];
            const configSettings = zH[serverId];
            
            if (resourceData && configSettings) {
              const decryptedUrl = decryptWitanimeServer(resourceData, configSettings);
              if (decryptedUrl) {
                witanimeAllServers.push({
                  name: serverName,
                  quality: serverName.toLowerCase().includes("fhd") ? "1080P" : serverName.toLowerCase().includes("hd") ? "720P" : "SD",
                  url: decryptedUrl
                });
              }
            }
          }
          
          // Filter by selected quality circle:
          if (state.activeQuality === 'fhd') {
            streamingServers = witanimeAllServers.filter(s => s.name.toLowerCase().includes("fhd") || s.quality === "1080P");
          } else {
            streamingServers = witanimeAllServers.filter(s => !s.name.toLowerCase().includes("fhd") && s.quality !== "1080P");
          }
          
          if (streamingServers.length === 0) {
            streamingServers = witanimeAllServers;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch/decrypt Witanime episode servers:", e);
    }
  }

  // 2. Fallback to default Jikan + Vidlink / Embed.su servers if Witanime failed or isn't available
  if (streamingServers.length === 0) {
    if (state.activeQuality === 'fhd') {
      streamingServers = [];
      if (state.activeAnime.anilistId) {
        streamingServers.push({
          name: "EMBED.SU (FHD - سيرفر سريع جداً)",
          quality: "1080P",
          url: `https://embed.su/embed/anime/${state.activeAnime.anilistId}/${epNum}`
        });
      }
      streamingServers.push({
        name: "PLAYTAKU (HD - ممتاز)",
        quality: "1080P",
        url: `https://playtaku.online/streaming.php?id=${gogoSlug}-episode-${epNum}`
      });
      streamingServers.push({
        name: "EMBTAKU (HD - بديل)",
        quality: "1080P",
        url: `https://embtaku.pro/streaming.php?id=${gogoSlug}-episode-${epNum}`
      });
      streamingServers.push({
        name: "VIDLINK (SD - احتياطي)",
        quality: "1080P",
        url: `https://vidlink.pro/anime/${state.activeAnime.mal_id}/${epNum}/sub?fallback=true&primaryColor=00a8cc`
      });
    } else {
      streamingServers = [];
      if (state.activeAnime.anilistId) {
        streamingServers.push({
          name: "EMBED.SU (FHD - سيرفر سريع جداً)",
          quality: "720P",
          url: `https://embed.su/embed/anime/${state.activeAnime.anilistId}/${epNum}`
        });
      }
      streamingServers.push({
        name: "PLAYTAKU (HD - ممتاز)",
        quality: "720P",
        url: `https://playtaku.online/streaming.php?id=${gogoSlug}-episode-${epNum}`
      });
      streamingServers.push({
        name: "EMBTAKU (HD - بديل)",
        quality: "720P",
        url: `https://embtaku.pro/streaming.php?id=${gogoSlug}-episode-${epNum}`
      });
      streamingServers.push({
        name: "VIDLINK (SD - احتياطي)",
        quality: "720P",
        url: `https://vidlink.pro/anime/${state.activeAnime.mal_id}/${epNum}/sub?fallback=true&primaryColor=00a8cc`
      });
      streamingServers.push({
        name: "YOUTUBE (البحث عن الحلقة)",
        quality: "FHD",
        url: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(state.activeAnime.title + " episode " + epNum)}`
      });
      if (state.activeAnime.trailer && state.activeAnime.trailer.youtube_id) {
        streamingServers.push({
          name: "العرض الدعائي للأنمي",
          quality: "FHD",
          url: `https://www.youtube.com/embed/${state.activeAnime.trailer.youtube_id}?autoplay=1&rel=0`
        });
      }
    }
  }

  state.activeServers = streamingServers;

  // Render the overlay banner
  const banner = state.activeAnime.trailer?.images?.maximum_image_url || state.activeAnime.images?.webp?.large_image_url || 'https://via.placeholder.com/800x450';
  if(DOM.serversOverlay) {
    DOM.serversOverlay.style.backgroundImage = `url('${banner}')`;
    DOM.serversOverlay.style.display = 'flex';
  }
  if(DOM.videoWrapper) DOM.videoWrapper.style.display = 'none';
  if(DOM.videoIframe) {
    DOM.videoIframe.src = '';
  }

  // Display servers on overlay
  if(DOM.serversButtons) {
    DOM.serversButtons.innerHTML = streamingServers.map((srv, idx) => {
      return `
        <div class="server-item" onclick="changeServer(${idx})">
           <div class="server-icon"><i class="fa-solid fa-bolt"></i></div>
           <div class="server-info">
              <div class="server-name">${srv.name}</div>
              <div class="server-quality">${srv.quality}</div>
           </div>
        </div>
      `;
    }).join('');
  }

  // Render the persistent horizontal switch bar (so user can switch servers while playing!)
  if(DOM.playerServersBar) {
    DOM.playerServersBar.innerHTML = streamingServers.map((srv, idx) => {
      const activeClass = idx === state.activeServerIndex ? 'active' : '';
      return `<button class="server-bar-btn ${activeClass}" onclick="changeServer(${idx})"><i class="fa-solid fa-server"></i> ${srv.name}</button>`;
    }).join('');
  }

  if(DOM.nextEpisodeBtn) {
    DOM.nextEpisodeBtn.disabled = state.activeEpisodeIndex === (episodes.length - 1);
  }

  // Auto-play the first server of the selected quality tab
  if (streamingServers.length > 0) {
    changeServer(0);
  }
}

window.changeEpisode = function(index) {
  state.activeEpisodeIndex = index;
  state.activeServerIndex = 0; 
  
  const epButtons = DOM.episodesGrid.querySelectorAll('.ep-num-btn');
  epButtons.forEach((btn, idx) => btn.classList.toggle('active', idx === index));
  
  loadActiveEpisodePlayback();
};

window.changeServer = function(index) {
  state.activeServerIndex = index;
  const server = state.activeServers[index];
  if (!server) return;

  if(DOM.serversOverlay) DOM.serversOverlay.style.display = 'none';
  if(DOM.videoWrapper) DOM.videoWrapper.style.display = 'block';

  // Update active states on the horizontal server bar
  if (DOM.playerServersBar) {
    const barButtons = DOM.playerServersBar.querySelectorAll('.server-bar-btn');
    barButtons.forEach((btn, idx) => btn.classList.toggle('active', idx === index));
  }

  if(DOM.videoIframe) {
    if(DOM.playerLoading) DOM.playerLoading.style.display = 'flex';
    DOM.videoIframe.src = server.url;
    DOM.videoIframe.onload = () => {
      if(DOM.playerLoading) DOM.playerLoading.style.display = 'none';
    };
  }
};

window.changeQuality = function(quality) {
  state.activeQuality = quality;
  state.activeServerIndex = 0; 
  loadActiveEpisodePlayback(); 
};

if(DOM.nextEpisodeBtn) {
  DOM.nextEpisodeBtn.addEventListener('click', () => {
    if (state.activeEpisodeIndex < state.activeAnime.fetchedEpisodes.length - 1) changeEpisode(state.activeEpisodeIndex + 1);
  });
}

// ==========================================================================
// TOAST NOTIFICATIONS & EVENTS
// ==========================================================================
let toastTimer = null;
function showToast(message) {
  if (!DOM.toastText || !DOM.toast) return;
  DOM.toastText.textContent = message;
  DOM.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

function registerEventListeners() {
  window.addEventListener('scroll', () => DOM.header.classList.toggle('scrolled', window.scrollY > 50));

  DOM.logoLink.onclick = (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    state.searchQuery = '';
    state.currentGenreFilter = 'all';
    DOM.searchInput.value = '';
    DOM.clearSearchBtn.style.display = 'none';
    DOM.filterBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-genre') === 'all'));
    renderAllAnime();
  };

  DOM.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    DOM.clearSearchBtn.style.display = state.searchQuery.trim() !== '' ? 'block' : 'none';
    renderAllAnime();
  });

  DOM.clearSearchBtn.addEventListener('click', () => {
    DOM.searchInput.value = '';
    state.searchQuery = '';
    DOM.clearSearchBtn.style.display = 'none';
    renderAllAnime();
  });

  DOM.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentGenreFilter = btn.getAttribute('data-genre');
      renderAllAnime();
    });
  });

  DOM.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-target');
      navigateToSection(targetId);
    });
  });

  // Sidebar Toggle Events
  if (DOM.sidebarToggleBtn) {
    DOM.sidebarToggleBtn.onclick = () => DOM.sidebarDrawer.classList.add('active');
  }
  if (DOM.sidebarCloseBtn) {
    DOM.sidebarCloseBtn.onclick = () => DOM.sidebarDrawer.classList.remove('active');
  }
  if (DOM.sidebarDrawerOverlay) {
    DOM.sidebarDrawerOverlay.onclick = () => DOM.sidebarDrawer.classList.remove('active');
  }

  // Sidebar nav link clicks
  if (DOM.sidebarNavLinks) {
    DOM.sidebarNavLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-target');
        DOM.sidebarDrawer.classList.remove('active');
        navigateToSection(targetId);
        
        DOM.sidebarNavLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });
  }

  // Profile Auth Modal Events
  if (DOM.authModalCloseBtn) {
    DOM.authModalCloseBtn.onclick = () => closeAuthModal();
  }
  if (DOM.authModalBackdrop) {
    DOM.authModalBackdrop.onclick = () => closeAuthModal();
  }

  // Avatar Option Click Selection
  if (DOM.avatarOptionImgs) {
    DOM.avatarOptionImgs.forEach(img => {
      img.onclick = () => {
        DOM.avatarOptionImgs.forEach(i => i.classList.remove('active'));
        img.classList.add('active');
        userState.selectedAvatar = img.getAttribute('data-avatar');
        
        // Reset custom upload name
        if (DOM.customAvatarName) DOM.customAvatarName.textContent = "";
      };
    });
  }

  // Custom avatar file upload
  if (DOM.customAvatarFile) {
    DOM.customAvatarFile.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (DOM.customAvatarName) DOM.customAvatarName.textContent = file.name;

      const reader = new FileReader();
      reader.onload = (event) => {
        userState.selectedAvatar = event.target.result; // Base64 data url!
        
        // Deactivate pre-selected avatar choices since custom file was loaded
        DOM.avatarOptionImgs.forEach(i => i.classList.remove('active'));
      };
      reader.readAsDataURL(file);
    };
  }

  // Submit Profile Changes / Signup - Handled by spa_overrides.js
  // Removed to avoid conflict with handleAuth() in spa_overrides.js

  if (DOM.modalCloseBtn) DOM.modalCloseBtn.addEventListener('click', closeAnimeModal);
  if (DOM.modalBackdrop) DOM.modalBackdrop.addEventListener('click', closeAnimeModal);
  if (DOM.backToServersBtn) {
    DOM.backToServersBtn.addEventListener('click', () => {
      if(DOM.videoWrapper) DOM.videoWrapper.style.display = 'none';
      if(DOM.serversOverlay) DOM.serversOverlay.style.display = 'flex';
      if(DOM.videoIframe) DOM.videoIframe.src = '';
    });
  }
  if (DOM.modalSaveBtn) {
    DOM.modalSaveBtn.addEventListener('click', () => {
      if (state.activeAnime) toggleBookmark(state.activeAnime);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.animeModal && DOM.animeModal.classList.contains('active')) {
        closeAnimeModal();
      } else if (DOM.authModal && DOM.authModal.classList.contains('active')) {
        closeAuthModal();
      } else if (DOM.sidebarDrawer && DOM.sidebarDrawer.classList.contains('active')) {
        DOM.sidebarDrawer.classList.remove('active');
      }
    }
  });
}

// ==========================================================================
// DYNAMIC USER PROFILE AND AUTH SYSTEM LOGIC (نظام الحساب والملف الشخصي)
// ==========================================================================
function initUserProfile() {
  const stored = localStorage.getItem('user_profile');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      userState.isLoggedIn = true;
      userState.username = parsed.username;
      userState.avatar = parsed.avatar;
      userState.selectedAvatar = parsed.avatar;
    } catch(e) {
      console.warn("Failed to load user profile", e);
    }
  }
  renderProfileCard();
  updateHeaderProfile();
}

function renderProfileCard() {
  const container = DOM.sidebarProfileCard;
  if (!container) return;

  if (!userState.isLoggedIn) {
    container.innerHTML = `
      <div style="font-family: 'Cairo', sans-serif; text-align: center;">
        <i class="fa-solid fa-circle-user" style="font-size: 3.6rem; color: var(--text-muted); margin-bottom: 8px;"></i>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="profile-avatar-wrapper" style="margin: 0 auto; display: block; text-align: center;">
        <img src="${userState.avatar}" alt="avatar" class="profile-avatar" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--accent-color);">
        <div class="profile-name" style="margin-top: 10px; font-weight: 700;">${userState.username}</div>
      </div>
    `;
  }
}

function updateHeaderProfile() {
  const profileBtn = DOM.headerProfileBtn;
  const avatarImg = DOM.headerAvatar;
  if (!profileBtn || !avatarImg) return;

  if (userState.isLoggedIn) {
    avatarImg.src = userState.avatar;
    profileBtn.style.display = 'flex';
    profileBtn.onclick = (e) => {
      e.stopPropagation();
      DOM.sidebarDrawer.classList.add('active');
    };
  } else {
    profileBtn.style.display = 'none';
  }
}

function openAuthModal(isEditing = false) {
  const authModal = DOM.authModal;
  const usernameInput = DOM.usernameInput;
  const authModalTitle = document.getElementById('authModalTitle');
  if (!authModal) return;

  if (isEditing) {
    authModalTitle.innerHTML = `<i class="fa-solid fa-user-pen highlight" style="color: var(--secondary-color);"></i> تعديل بيانات الحساب`;
    if (usernameInput) usernameInput.value = userState.username;
    userState.selectedAvatar = userState.avatar;
  } else {
    authModalTitle.innerHTML = `<i class="fa-solid fa-user-gear highlight" style="color: var(--secondary-color);"></i> تسجيل الدخول / حساب جديد`;
    if (usernameInput) usernameInput.value = "";
    userState.selectedAvatar = "https://api.dicebear.com/7.x/bottts/svg?seed=Luffy";
  }

  // Highlight selected avatar in choices
  if (DOM.avatarOptionImgs) {
    DOM.avatarOptionImgs.forEach(img => {
      const isCurrent = img.getAttribute('data-avatar') === userState.selectedAvatar;
      img.classList.toggle('active', isCurrent);
    });
  }

  if (DOM.customAvatarName) DOM.customAvatarName.textContent = "";

  authModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  if (DOM.authModal) {
    DOM.authModal.classList.remove('active');
    if (!state.activeAnime) {
      document.body.style.overflow = '';
    }
  }
}

function handleLogout() {
  localStorage.removeItem('user_profile');
  userState.isLoggedIn = false;
  userState.username = "";
  userState.avatar = "";
  userState.selectedAvatar = "https://api.dicebear.com/7.x/bottts/svg?seed=Luffy";

  loadSavedListFromStorage(); // Reload default guest saved list
  renderProfileCard();
  updateHeaderProfile();
  if (typeof updateCommentFormVisibility === 'function') updateCommentFormVisibility();
  showToast("تم تسجيل الخروج بنجاح 👋");
}

function navigateToSection(sectionId, smoothScroll = true) {
  const element = document.getElementById(sectionId);
  if (!element) return;
  const offset = 90;
  const elementPosition = element.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: elementPosition - offset, behavior: smoothScroll ? 'smooth' : 'auto' });
  updateNavActiveLink(sectionId);
}

function updateNavActiveLink(sectionId) {
  if (DOM.navLinks) DOM.navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('data-target') === sectionId));
  if (DOM.mobileLinks) DOM.mobileLinks.forEach(link => link.classList.toggle('active', link.getAttribute('data-target') === sectionId));
}

// ==========================================================================
// CIRCLES & AUDIO BOOSTER LOGIC (التحكم بالدوائر ومضخم الصوت)
// ==========================================================================
window.changeCircleQuality = function(quality) {
  state.activeQuality = quality;
  state.activeServerIndex = 0;
  
  const btnFHD = document.getElementById('btnFHD');
  const btnHD = document.getElementById('btnHD');
  if (btnFHD && btnHD) {
    btnFHD.classList.toggle('active', quality === 'fhd');
    btnHD.classList.toggle('active', quality === 'hd');
  }
  
  loadActiveEpisodePlayback();
};

let audioCtx = null;
let gainNode = null;
let sourceMap = new WeakMap();

function initAudioBoost() {
  const slider = document.getElementById('audioBoostSlider');
  const valueText = document.getElementById('boosterValue');
  const indicator = document.getElementById('boosterIndicatorBar');

  if (!slider) return;

  const updateBoost = () => {
    const value = parseInt(slider.value);
    if (valueText) valueText.textContent = `${value}%`;
    
    const percent = ((value - 100) / 300) * 100;
    if (indicator) indicator.style.width = `${percent}%`;

    const multiplier = value / 100.0;
    const videos = document.querySelectorAll('video');
    
    videos.forEach(video => {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          gainNode = audioCtx.createGain();
          gainNode.connect(audioCtx.destination);
        }
        if (!sourceMap.has(video)) {
          const source = audioCtx.createMediaElementSource(video);
          source.connect(gainNode);
          sourceMap.set(video, source);
        }
        gainNode.gain.value = multiplier;
      } catch (e) {
        console.warn("Cross-Origin audio boost skipped for this element:", e);
      }
    });
  };

  slider.addEventListener('input', updateBoost);
  updateBoost();

  setInterval(() => {
    if (slider.value > 100) updateBoost();
  }, 1500);
}

// ==========================================================================
// WATCH HISTORY & LATEST EPISODES GRIDS (سجل المشاهدة وآخر الحلقات المضافة)
// ==========================================================================
function saveWatchHistoryItem(anime, episodeIndex) {
  if (!anime) return;
  
  let history = [];
  try {
    const stored = localStorage.getItem('watchHistory');
    if (stored) history = JSON.parse(stored);
  } catch(e) {}
  
  // Remove duplicate entries
  history = history.filter(item => item.mal_id !== anime.mal_id);
  
  const epNum = episodeIndex + 1;
  const today = new Date();
  
  // Create beautiful history record
  const historyItem = {
    mal_id: anime.mal_id,
    title: anime.title,
    poster: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url,
    episodeIndex: episodeIndex,
    episodeNumber: epNum,
    timestamp: today.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
    progress: Math.floor(Math.random() * 30) + 60 // Simulated progress bar percentage (60%-90%)
  };
  
  history.unshift(historyItem); // Add to top
  
  // Keep only the last 6 items
  if (history.length > 6) {
    history.pop();
  }
  
  localStorage.setItem('watchHistory', JSON.stringify(history));
  renderWatchHistoryGrid();
}

function renderWatchHistoryGrid() {
  let history = [];
  try {
    const stored = localStorage.getItem('watchHistory');
    if (stored) history = JSON.parse(stored);
  } catch(e) {}

  const section = document.getElementById('continueWatchingSection');
  const grid = document.getElementById('continueWatchingGrid');
  
  if (!section || !grid) return;
  
  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  
  grid.innerHTML = history.map(item => {
    return `
      <article class="anime-card history-card" data-id="${item.mal_id}" onclick="resumeWatchHistory(${item.mal_id}, ${item.episodeIndex})">
        <div class="card-img-wrapper">
          <img src="${item.poster}" alt="${item.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
          <div class="card-overlays">
            <span class="card-badge" style="background: #ff69b4; box-shadow: 0 0 10px rgba(255, 105, 180, 0.6); pointer-events: none;"><i class="fa-solid fa-clock"></i> ح ${item.episodeNumber}</span>
          </div>
          <!-- Watch Duration Progress Bar Overlay -->
          <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 5px; background: rgba(255,255,255,0.15); z-index: 5;">
            <div style="width: ${item.progress}%; height: 100%; background: linear-gradient(90deg, #ff69b4, #ff3333); box-shadow: 0 0 8px #ff69b4;"></div>
          </div>
        </div>
        <div class="card-info">
          <h3 class="card-title" onclick="resumeWatchHistory(${item.mal_id}, ${item.episodeIndex})">${item.title}</h3>
          <div class="card-meta-info">
            <span style="font-size: 0.72rem; color: #ff69b4; font-weight: 700;"><i class="fa-solid fa-circle-play"></i> استئناف الحلقة ${item.episodeNumber}</span>
            <span style="font-size: 0.72rem; color: #888;">${item.timestamp}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

window.resumeWatchHistory = async function(malId, episodeIndex) {
  let targetAnime = getAnimeDataObj(malId);
  if (!targetAnime) {
    try {
      const res = await fetch(`${API_BASE}/anime/${malId}`);
      const data = await res.json();
      targetAnime = data.data;
    } catch(e) {
      console.warn("Failed to load anime for history resume:", e);
    }
  }
  if (!targetAnime) return;
  
  await openAnimeModal(malId);
  changeEpisode(episodeIndex);
};

async function renderLatestEpisodes() {
  const grid = document.getElementById('latestEpisodesGrid');
  if (!grid) return;
  
  try {
    const res = await fetch('https://api.jikan.moe/v4/watch/episodes');
    const data = await res.json();
    if(data && data.data && data.data.length > 0) {
      grid.innerHTML = data.data.slice(0, 8).map(item => {
         const anime = item.entry;
         let epStr = item.episodes && item.episodes.length > 0 ? item.episodes[0].title : "الحلقة 1";
         let epNum = parseInt(epStr.match(/\d+/)) || 1;
         const poster = anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url;
         return `
          <article class="anime-card episode-card" data-id="${anime.mal_id}">
            <div class="card-img-wrapper" onclick="openLatestEpisode(${anime.mal_id}, ${epNum - 1})">
              <img src="${poster}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
              <div class="card-overlays">
                <span class="card-badge" style="background: #00a8cc; box-shadow: 0 0 10px rgba(0, 168, 204, 0.6); pointer-events: none;"><i class="fa-solid fa-play"></i> الحلقة ${epNum}</span>
              </div>
            </div>
            <div class="card-info">
              <h3 class="card-title" onclick="openLatestEpisode(${anime.mal_id}, ${epNum - 1})">${anime.title}</h3>
              <div class="card-meta-info">
                <span style="font-size: 0.72rem; color: #aaa;"><i class="fa-solid fa-clock"></i> أضيف حديثاً</span>
              </div>
            </div>
          </article>
        `;
      }).join('');
      return;
    }
  } catch(e) {}
  
  if (state.seasonalAnime.length > 0) {
    grid.innerHTML = state.seasonalAnime.slice(0, 8).map(a => {
      const epNum = Math.floor(Math.random() * 5) + 1;
      const poster = a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url;
      return `
        <article class="anime-card episode-card" data-id="${a.mal_id}">
          <div class="card-img-wrapper" onclick="openLatestEpisode(${a.mal_id}, ${epNum - 1})">
            <img src="${poster}" alt="${a.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
            <div class="card-overlays">
              <span class="card-badge" style="background: #00a8cc; box-shadow: 0 0 10px rgba(0, 168, 204, 0.6); pointer-events: none;"><i class="fa-solid fa-play"></i> الحلقة ${epNum}</span>
            </div>
          </div>
          <div class="card-info">
            <h3 class="card-title" onclick="openLatestEpisode(${a.mal_id}, ${epNum - 1})">${a.title}</h3>
            <div class="card-meta-info">
              <span style="font-size: 0.72rem; color: #aaa;"><i class="fa-solid fa-clock"></i> أضيف حديثاً</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }
}

window.openLatestEpisode = async function(animeId, episodeIndex) {
  document.body.style.overflow = ''; // Unlock body scroll in case of previous freeze
  try {
    if (typeof window.openAnimeDetails === 'function') {
      await window.openAnimeDetails(animeId);
      if (typeof window.openPlayerView === 'function') {
        await window.openPlayerView(episodeIndex);
      }
    }
  } catch(e) {
    console.error("Failed to open latest episode:", e);
  }
};
