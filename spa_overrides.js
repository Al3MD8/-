// SPA Overrides v7 - Search fixes, Emoji picker, Seasons relations, and Comment deletion.

// Universal Global Cache & Helper Engine
if (!state.animeCache) state.animeCache = {};

window.getAnimeDataObj = function(mal_id) {
  if (!state.animeCache) state.animeCache = {};
  return state.animeCache[mal_id] ||
         state.popularAnime.find(a => a.mal_id == mal_id) || 
         state.seasonalAnime.find(a => a.mal_id == mal_id) || 
         state.savedAnimesData.find(a => a.mal_id == mal_id);
};

window.createAnimeCardHTML = function(anime) {
  if (!anime) return '';
  if (!state.animeCache) state.animeCache = {};
  state.animeCache[anime.mal_id] = anime; // Store in cache immediately on render!

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
            <button class="card-save-btn ${saveBtnSavedClass}" data-id="${anime.mal_id}" aria-label="حفظ الأنمي" onclick="event.stopPropagation(); toggleBookmark(window.getAnimeDataObj(${anime.mal_id}))">
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
};

window.switchView = function(viewId) {
  document.querySelectorAll('.spa-view').forEach(v => { v.classList.remove('active'); v.style.display = 'none'; });
  const view = document.getElementById(viewId);
  if(view) { view.classList.add('active'); view.style.display = 'block'; }
  window.scrollTo({ top: 0 });
  document.body.style.overflow = '';
};

// State
let browseState = { page: 1, perPage: 24, filter: 'all', search: '' };
let commentImageBase64 = '';
let currentAuthTab = 'login';
let replyToCommentId = null;
let browseSearchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar nav links
  document.querySelectorAll('.sidebar-nav-link').forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target');
      document.querySelectorAll('.sidebar-nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      if(target === 'home') { switchView('homeView'); }
      else if(target === 'browse') { switchView('browseView'); renderBrowsePage(); }
      else if(target === 'saved') { switchView('savedView'); renderSavedAnimeSPA(); }
      else if(target === 'continueWatchingSection') { switchView('historyView'); renderWatchHistoryGridSPA(); }
      closeSidebar();
    };
  });

  // Back from player
  const btn = document.getElementById('btnBackToDetails');
  if(btn) btn.onclick = () => { document.getElementById('mainVideoIframe').src = ''; switchView('detailsView'); };

  // Sync the main desktop search bar with the Browse page search dynamically
  const mainSearch = document.getElementById('searchInput');
  const browseSearch = document.getElementById('browseSearchInput');
  const mainClear = document.getElementById('clearSearchBtn');
  
  if (mainSearch) {
    mainSearch.addEventListener('input', (e) => {
      const val = e.target.value;
      if (mainClear) mainClear.style.display = val.trim() !== '' ? 'block' : 'none';
      
      // Sync with browse search input
      if (browseSearch) browseSearch.value = val;
      browseState.search = val;
      browseState.page = 1;
      
      // Auto-switch to Browse page if not already there
      const currentActiveView = document.querySelector('.spa-view.active');
      if (currentActiveView && currentActiveView.id !== 'browseView') {
        switchView('browseView');
        // Update navigation active links
        document.querySelectorAll('.sidebar-nav-link').forEach(l => l.classList.toggle('active', l.getAttribute('data-target') === 'browse'));
        document.querySelectorAll('.desktop-nav a').forEach(l => {
          const isBrowse = l.getAttribute('onclick') && l.getAttribute('onclick').includes('browseView');
          l.style.color = isBrowse ? 'var(--accent-color)' : 'white';
        });
      }
      
      if (browseSearchTimeout) clearTimeout(browseSearchTimeout);
      browseSearchTimeout = setTimeout(() => {
        renderBrowsePage();
      }, 500);
    });
  }

  if (mainClear) {
    mainClear.addEventListener('click', () => {
      if (mainSearch) mainSearch.value = '';
      if (browseSearch) browseSearch.value = '';
      mainClear.style.display = 'none';
      browseState.search = '';
      browseState.page = 1;
      renderBrowsePage();
    });
  }

  // Dynamic Browse Search box with debouncing to support unlimited search of MAL's entire library!
  const bs = document.getElementById('browseSearchInput');
  if(bs) bs.addEventListener('input', (e) => {
    browseState.search = e.target.value;
    browseState.page = 1;
    if(browseSearchTimeout) clearTimeout(browseSearchTimeout);
    browseSearchTimeout = setTimeout(() => {
      renderBrowsePage();
    }, 600);
  });

  // Browse genre filters
  document.querySelectorAll('#browseFilters .filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#browseFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      browseState.filter = btn.getAttribute('data-genre');
      browseState.page = 1;
      renderBrowsePage();
    };
  });

  // Emoji Picker listener
  const picker = document.querySelector('emoji-picker');
  if(picker) {
    picker.addEventListener('emoji-click', event => {
      insertEmoji(event.detail.unicode);
      document.getElementById('emojiPickerContainer').style.display = 'none';
    });
  }

  // Register image paste support (Ctrl+V) directly into the comments area!
  const commentInput = document.getElementById('commentInput');
  if (commentInput) {
    commentInput.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => {
            commentImageBase64 = ev.target.result;
            document.getElementById('commentPreviewImg').src = commentImageBase64;
            document.getElementById('commentImagePreview').style.display = 'block';
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    });
  }

  // Avatar selection options
  document.querySelectorAll('.avatar-option-img').forEach(img => {
    img.onclick = () => {
      document.querySelectorAll('.avatar-option-img').forEach(i => i.classList.remove('active'));
      img.classList.add('active');
      userState.selectedAvatar = img.getAttribute('data-avatar');
    };
  });

  // Auth submit trigger
  const authBtn = document.getElementById('authSubmitBtn');
  if(authBtn) authBtn.onclick = () => handleAuth();

  // Comment manual image upload
  const imgUpload = document.getElementById('commentImageUpload');
  if(imgUpload) imgUpload.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      commentImageBase64 = ev.target.result;
      document.getElementById('commentPreviewImg').src = commentImageBase64;
      document.getElementById('commentImagePreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  };
});

function closeSidebar() {
  const d = document.getElementById('sidebarDrawer');
  if(d) { d.classList.remove('open'); d.classList.remove('active'); }
  document.body.style.overflow = '';
}

// ===== UNIVERSAL BROWSE PAGE WITH DYNAMIC JIKAN CATALOG & SEARCH =====
window.renderBrowsePage = async function() {
  const grid = document.getElementById('browseAnimeGrid');
  if(!grid) return;
  
  grid.innerHTML = '<div class="spinner" style="margin:50px auto;"></div>';
  
  let items = [];
  let totalPages = 1;

  const genreIds = {
    'Action': 1,
    'Adventure': 2,
    'Comedy': 4,
    'Fantasy': 10,
    'Sci-Fi': 24,
    'Drama': 8,
    'Romance': 22
  };

  try {
    let url = '';
    if (browseState.search.trim() !== '') {
      // Dynamic search query across over 10,000+ anime titles
      const q = encodeURIComponent(browseState.search.trim());
      url = `https://api.jikan.moe/v4/anime?q=${q}&page=${browseState.page}&limit=${browseState.perPage}&order_by=popularity`;
    } else {
      // Universal catalog browser (popular first) sorted dynamically with pagination!
      if (browseState.filter !== 'all') {
        const gId = genreIds[browseState.filter];
        url = `https://api.jikan.moe/v4/anime?genres=${gId}&page=${browseState.page}&limit=${browseState.perPage}&order_by=popularity`;
      } else {
        url = `https://api.jikan.moe/v4/anime?page=${browseState.page}&limit=${browseState.perPage}&order_by=popularity`;
      }
    }

    const res = await fetch(url);
    const data = await res.json();
    items = data.data || [];
    const paginationData = data.pagination;
    totalPages = paginationData ? (paginationData.last_visible_page || 1) : 1;
    
    // Safety cap to avoid requesting blank pages
    if (totalPages > 1000) totalPages = 1000;
  } catch(e) {
    console.warn("Jikan API universal catalog fetch failed, using local fallback:", e);
    // Local fallback using seasonal + popular lists
    let allItems = [...state.seasonalAnime, ...state.popularAnime];
    const seen = new Set();
    allItems = allItems.filter(a => { if(seen.has(a.mal_id)) return false; seen.add(a.mal_id); return true; });

    if (browseState.search.trim() !== '') {
      const term = browseState.search.toLowerCase();
      allItems = allItems.filter(a => a.title.toLowerCase().includes(term) || (a.title_english && a.title_english.toLowerCase().includes(term)));
    } else if (browseState.filter !== 'all') {
      allItems = allItems.filter(a => a.genres && a.genres.some(g => g.name === browseState.filter));
    }

    totalPages = Math.ceil(allItems.length / browseState.perPage);
    const start = (browseState.page - 1) * browseState.perPage;
    items = allItems.slice(start, start + browseState.perPage);
  }

  if(items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>لا توجد نتائج مطابقة لتصفحك</h3></div>';
  } else {
    grid.innerHTML = items.map(a => window.createAnimeCardHTML(a)).join('');
    attachCardSaveEvents(grid);
  }

  // Render pagination
  const pag = document.getElementById('browsePagination');
  if(!pag) return;
  let pagHtml = '';
  if (totalPages > 1) {
    const maxButtons = 7;
    let startPage = Math.max(1, browseState.page - 3);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if(endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if(startPage > 1) {
      pagHtml += `<button class="btn btn-secondary" onclick="browseGoToPage(1)">1</button>`;
      if(startPage > 2) pagHtml += `<span style="color:var(--text-sub);padding:5px;">...</span>`;
    }
    
    for(let i = startPage; i <= endPage; i++) {
      const cls = i === browseState.page ? 'btn btn-primary' : 'btn btn-secondary';
      pagHtml += `<button class="${cls}" style="min-width:40px;padding:8px 12px;" onclick="browseGoToPage(${i})">${i}</button>`;
    }
    
    if(endPage < totalPages) {
      if(endPage < totalPages - 1) pagHtml += `<span style="color:var(--text-sub);padding:5px;">...</span>`;
      pagHtml += `<button class="btn btn-secondary" onclick="browseGoToPage(${totalPages})">${totalPages}</button>`;
    }
  }
  pag.innerHTML = pagHtml;
};

window.browseGoToPage = function(p) { browseState.page = p; renderBrowsePage(); window.scrollTo({top:0,behavior:'smooth'}); };

// ===== SAVED VIEW =====
function renderSavedAnimeSPA() {
  const grid = document.getElementById('savedViewGrid');
  if(!grid) return;
  if(state.savedAnimesData.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>قائمتك المحفوظة فارغة حالياً.</h3></div>';
  } else {
    grid.innerHTML = state.savedAnimesData.map(a => window.createAnimeCardHTML(a)).join('');
    attachCardSaveEvents(grid);
  }
}

// ===== HISTORY VIEW =====
window.renderWatchHistoryGridSPA = function() {
  const grid = document.getElementById('historyViewGrid');
  if(!grid) return;
  
  let history = [];
  try {
    const s = localStorage.getItem('animeWatchHistory');
    if(s) history = JSON.parse(s);
  } catch(e) {}
  
  if(history.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>سجل المشاهدة الخاص بك فارغ</h3></div>';
    return;
  }
  
  // Sort by last watched timestamp
  history.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
  
  grid.innerHTML = history.map(item => {
    const poster = item.poster || item.anime?.images?.webp?.large_image_url || 'https://via.placeholder.com/300x400?text=No+Image';
    const title = item.title || item.anime?.title || 'أنمي';
    const id = item.mal_id || item.anime?.mal_id;
    const epNum = item.episodeNumber || (item.episodeIndex + 1);
    
    return `
      <article class="anime-card" style="cursor:pointer;" onclick="openLatestEpisode(${id}, ${item.episodeIndex})">
        <div class="card-img-wrapper" onclick="openLatestEpisode(${id}, ${item.episodeIndex})">
          <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
          <div class="card-overlays">
            <span class="card-badge" style="background:#ff69b4;">ح ${epNum}</span>
          </div>
        </div>
        <div class="card-info" style="padding:10px;text-align:center;">
          <h3 class="card-title" onclick="openLatestEpisode(${id}, ${item.episodeIndex})" style="font-size:0.95rem;">${title}</h3>
        </div>
      </article>
    `;
  }).join('');
};

// ===== ANIME DETAILS AND RELATED SEASONS =====
window.openAnimeDetails = async function(animeId) {
  let anime = getAnimeDataObj(animeId);
  if(!anime) {
    try { const r = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`); const d = await r.json(); anime = d.data; } catch(e) { return; }
  }
  state.activeAnime = anime;
  document.getElementById('detailsTitle').textContent = anime.title_english || anime.title;
  document.getElementById('detailsBanner').src = anime.images?.webp?.large_image_url || '';
  document.getElementById('detailsDesc').textContent = anime.synopsis || 'لا يوجد وصف متاح.';
  document.getElementById('detailsType').textContent = anime.type || 'TV';
  document.getElementById('detailsSeason').textContent = anime.season ? `${anime.season} ${anime.year}` : '-';
  document.getElementById('detailsStatus').textContent = anime.status === 'Currently Airing' ? 'مستمر' : 'مكتمل';
  document.getElementById('detailsCount').textContent = anime.episodes || '?';
  document.getElementById('detailsRating').textContent = anime.score || '-';
  document.getElementById('detailsGenres').innerHTML = (anime.genres||[]).map(g => `<span class="season-badge" style="background:rgba(255,255,255,0.1);border:1px solid var(--border-glass);font-size:0.8rem;padding:4px 12px;">${g.name}</span>`).join('');
  
  const saveBtn = document.getElementById('detailsSaveBtn');
  saveBtn.onclick = () => toggleBookmark(anime);
  const isSaved = state.savedAnimeIds.includes(anime.mal_id);
  saveBtn.innerHTML = isSaved ? '<i class="fa-solid fa-bookmark"></i> محفوظ' : '<i class="fa-regular fa-bookmark"></i> حفظ';
  
  const malLink = document.getElementById('detailsMalLink');
  if(malLink) malLink.href = anime.url || '#';

  switchView('detailsView');

  // Load episodes
  const grid = document.getElementById('detailsEpisodesGrid');
  grid.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  
  // Load related seasons (NEW FEATURE)
  const relationsContainer = document.getElementById('detailsRelationsSection') || (() => {
    const section = document.createElement('div');
    section.id = 'detailsRelationsSection';
    section.style.marginTop = '40px';
    section.style.background = 'rgba(10,12,22,0.6)';
    section.style.padding = '30px';
    section.style.borderRadius = '16px';
    section.innerHTML = `
      <h2 style="font-size:1.3rem;color:var(--accent-color);margin-bottom:20px;"><i class="fa-solid fa-layer-group"></i> مواسم وأجزاء ذات صلة</h2>
      <div id="detailsRelationsGrid" style="display:flex;gap:15px;overflow-x:auto;padding-bottom:15px;"></div>
    `;
    document.getElementById('detailsEpisodesGrid').parentElement.parentElement.appendChild(section);
    return section;
  })();
  const relGrid = document.getElementById('detailsRelationsGrid');
  relGrid.innerHTML = '<div class="spinner"></div>';
  
  // Optimistic Instant Episodes Rendering
  const total = anime.episodes || 0;
  let initialEps = [];
  if (total > 0) {
    initialEps = Array.from({length: total}, (_,i) => ({mal_id:i+1, title:'الحلقة '+(i+1)}));
  } else {
    initialEps = Array.from({length: 12}, (_,i) => ({mal_id:i+1, title:'الحلقة '+(i+1)}));
  }
  state.activeAnime.fetchedEpisodes = initialEps;
  
  // Render episodes grid instantly!
  grid.innerHTML = initialEps.map((ep,idx) => `
    <button class="ep-card-btn" onclick="openPlayerView(${idx})">
      <i class="fa-solid fa-play-circle"></i> الحلقة ${idx+1}
    </button>
  `).join('');

  // Fetch detailed data asynchronously in the background
  (async () => {
    try {
      const [witanimeEps, apiEps, anilistId] = await Promise.all([
        window.getWitanimeEpisodes(anime).catch(() => []),
        fetchAnimeEpisodes(anime.mal_id).catch(() => []),
        state.activeAnime.anilistId ? Promise.resolve(state.activeAnime.anilistId) : getAnilistId(anime.mal_id).catch(() => null)
      ]);
      
      state.activeAnime.anilistId = anilistId;
      
      let finalEps = witanimeEps && witanimeEps.length > 0 ? witanimeEps : (apiEps && apiEps.length > 0 ? apiEps : initialEps);
      state.activeAnime.fetchedEpisodes = finalEps;
      
      // Update grid dynamically with real titles if any changed, keeping the click index intact
      grid.innerHTML = finalEps.map((ep,idx) => `
        <button class="ep-card-btn" onclick="openPlayerView(${idx})">
          <i class="fa-solid fa-play-circle"></i> ${ep.title || 'الحلقة '+(idx+1)}
        </button>
      `).join('');
    } catch(e) {
      console.warn("Background episodes load error:", e);
    }
  })();

  // Process Relations (Sequels / Prequels) with Rich Posters
  try {
    const relRes = await fetch(`https://api.jikan.moe/v4/anime/${anime.mal_id}/relations`);
    const relData = await relRes.json();
    let relatedAnime = [];
    if(relData && relData.data) {
      relData.data.forEach(group => {
         if(['Sequel', 'Prequel', 'Side story', 'Spin-off', 'Alternative setting'].includes(group.relation)) {
           group.entry.forEach(item => {
             if(item.type === 'anime') relatedAnime.push({ ...item, relation: group.relation });
           });
         }
      });
    }
    
    if(relatedAnime.length > 0) {
      // Fetch posters in parallel (up to 4 items to prevent rate limits)
      const detailedRels = await Promise.all(relatedAnime.slice(0, 4).map(async (rel) => {
        // If already cached in state, use it!
        if (state.animeCache && state.animeCache[rel.mal_id]) {
          const c = state.animeCache[rel.mal_id];
          return { ...rel, image: c.images?.webp?.large_image_url || c.images?.jpg?.large_image_url };
        }
        try {
          const res = await fetch(`https://api.jikan.moe/v4/anime/${rel.mal_id}`);
          if (res.ok) {
            const d = await res.json();
            const animeObj = d.data;
            if (animeObj) {
              if (!state.animeCache) state.animeCache = {};
              state.animeCache[rel.mal_id] = animeObj; // Cache it!
              return { ...rel, image: animeObj.images?.webp?.large_image_url || animeObj.images?.jpg?.large_image_url };
            }
          }
        } catch(e) {}
        return { ...rel, image: 'https://via.placeholder.com/150x200?text=No+Poster' };
      }));

      relGrid.innerHTML = detailedRels.map(rel => {
        let badgeColor = rel.relation === 'Sequel' ? '#00a8cc' : rel.relation === 'Prequel' ? '#ff69b4' : '#888';
        let badgeText = rel.relation === 'Sequel' ? 'تكملة (موسم تالي)' : rel.relation === 'Prequel' ? 'موسم سابق' : 'قصة ذات صلة';
        const img = rel.image || 'https://via.placeholder.com/150x200?text=No+Poster';
        return `
        <div onclick="openAnimeDetails(${rel.mal_id})" style="flex:0 0 160px;background:rgba(26,29,46,0.8);border:1px solid var(--border-glass);border-radius:12px;overflow:hidden;cursor:pointer;transition:0.3s;display:flex;flex-direction:column;" onmouseover="this.style.borderColor='var(--accent-color)';this.style.transform='translateY(-5px)'" onmouseout="this.style.borderColor='var(--border-glass)';this.style.transform='translateY(0)'">
          <div style="position:relative;width:100%;height:180px;overflow:hidden;">
            <img src="${img}" alt="${rel.name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.src='https://via.placeholder.com/150x200?text=No+Poster'">
            <div style="position:absolute;top:6px;right:6px;background:${badgeColor};color:white;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;box-shadow:0 0 6px ${badgeColor};">${badgeText}</div>
          </div>
          <div style="padding:10px;flex:1;display:flex;align-items:center;justify-content:center;text-align:center;">
            <h4 style="font-size:0.85rem;line-height:1.4;margin:0;color:white;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${rel.name}</h4>
          </div>
        </div>
      `}).join('');
    } else {
      relGrid.innerHTML = '<p style="color:var(--text-sub);">لا توجد مواسم أخرى معروفة لهذا الأنبي.</p>';
    }
  } catch(e) {
    relGrid.innerHTML = '<p style="color:var(--text-sub);">تعذر جلب المواسم.</p>';
  }
};

// Helper: Classify server names into appropriate FHD or HD categories
function classifyServerQuality(name) {
  const n = name.toLowerCase();
  if(n.includes('fhd') || n.includes('1080') || n.includes('drive') || n.includes('google') || n.includes('mega') || n.includes('fembed') || n.includes('okru') || n.includes('ok.ru') || n.includes('vidlink (مترجم)')) {
    return 'fhd';
  }
  return 'hd';
}

// ===== PLAYER VIEW =====
window.openPlayerView = async function(epIndex) {
  state.activeEpisodeIndex = epIndex;
  const anime = state.activeAnime;
  const episodes = anime.fetchedEpisodes;
  if(!episodes || !episodes.length) return;
  
  switchView('playerView');
  document.getElementById('playerEpTitle').textContent = (anime.title_english || anime.title) + ' - الحلقة ' + (epIndex+1);
  
  // Set blurred bg
  const bgEl = document.getElementById('serverOverlayBg');
  if(bgEl) bgEl.style.backgroundImage = `url('${anime.images?.webp?.large_image_url || ''}')`;
  
  // Sidebar episodes
  const sidebar = document.getElementById('playerSidebarEps');
  sidebar.innerHTML = episodes.map((ep,idx) => {
    const active = idx === epIndex;
    return `<div class="ep-sidebar-item ${active?'active':''}" onclick="openPlayerView(${idx})">الحلقة ${idx+1}</div>`;
  }).join('');
  setTimeout(() => { const el = sidebar.children[epIndex]; if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); }, 200);

  // Show server overlay, hide iframe
  document.getElementById('serversSelectionOverlay').style.display = 'flex';
  document.getElementById('mainVideoIframe').src = '';
  document.getElementById('playerServersList').innerHTML = '<div class="spinner"></div>';

  // Fetch servers
  const epNum = epIndex + 1;
  let gogoSlug = await getGogoanimeId(anime);
  let servers = [];
  const episode = episodes[epIndex];
  
  if(episode.url && episode.url.includes('witanime')) {
    try {
      let html = '';
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port;
      
      if (isLocal) {
        const resp = await fetch('/api/proxy?url=' + encodeURIComponent(episode.url));
        if (resp.ok) {
          html = await resp.text();
        }
      } else {
        const resp = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(episode.url));
        if (resp.ok) {
          const data = await resp.json();
          html = data.contents || '';
        }
      }
      
      if (html) {
        const zG_m = html.match(/var _zG\s*=\s*"([^"]+)";/);
        const zH_m = html.match(/var _zH\s*=\s*"([^"]+)";/);
        if(zG_m && zH_m) {
          const zG = JSON.parse(atob(zG_m[1]));
          const zH = JSON.parse(atob(zH_m[1]));
          let m; const rx = /data-server-id="(\d+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/g;
          while((m=rx.exec(html))!==null) {
            const d = decryptWitanimeServer(zG[parseInt(m[1])], zH[parseInt(m[1])]);
            if(d) {
              const name = m[2].trim();
              servers.push({name: name, url:d, quality: classifyServerQuality(name)});
            }
          }
        }
      }
    } catch(e) {
      console.warn("Failed to load Witanime servers:", e);
    }
  }

  if(servers.length === 0) {
    servers = [
      {name:'VIDLINK (مترجم)', url:`https://vidlink.pro/anime/${anime.mal_id}/${epNum}/sub?fallback=true&primaryColor=00a8cc`, quality:'fhd'},
      {name:'VIDLINK (مدبلج)', url:`https://vidlink.pro/anime/${anime.mal_id}/${epNum}/dub?fallback=true&primaryColor=00a8cc`, quality:'hd'},
    ];
    if(anime.anilistId) servers.push({name:'EMBED.SU', url:`https://embed.su/embed/anime/${anime.anilistId}/${epNum}`, quality:'fhd'});
    if(gogoSlug) servers.push({name:'PLAYTAKU', url:`https://playtaku.online/streaming.php?id=${gogoSlug}-episode-${epNum}`, quality:'hd'});
  }

  state.activeServers = servers;
  
  // Smart Dynamic Quality Tabs Controller
  const hasFHD = servers.some(s => s.quality === 'fhd');
  const hasHD = servers.some(s => s.quality === 'hd');
  const btnFHD = document.querySelector('.quality-circle[data-q="fhd"]');
  const btnHD = document.querySelector('.quality-circle[data-q="hd"]');
  const qualityTabs = document.getElementById('qualityTabs');

  if (qualityTabs && btnFHD && btnHD) {
    if (hasFHD && hasHD) {
      // Both qualities exist: Show both tabs
      qualityTabs.style.display = 'flex';
      btnFHD.style.display = 'inline-block';
      btnHD.style.display = 'inline-block';
      window.filterServersByQuality('fhd'); // Default to best quality
    } else if (hasFHD) {
      // Only FHD exists: Hide tabs and auto-select FHD
      qualityTabs.style.display = 'none';
      window.filterServersByQuality('fhd');
    } else if (hasHD) {
      // Only HD exists (like Naruto/older anime): Hide tabs and auto-select HD
      qualityTabs.style.display = 'none';
      window.filterServersByQuality('hd');
    } else {
      // No specific categories: Hide tabs and show all available
      qualityTabs.style.display = 'none';
      window.filterServersByQuality('all');
    }
  } else {
    window.filterServersByQuality('fhd');
  }

  // Nav buttons
  document.getElementById('btnNextEpFull').onclick = () => { if(epIndex < episodes.length-1) openPlayerView(epIndex+1); };
  document.getElementById('btnPrevEpFull').onclick = () => { if(epIndex > 0) openPlayerView(epIndex-1); };

  // Load comments
  cancelReply();
  loadComments();
};

window.filterServersByQuality = function(q) {
  document.querySelectorAll('.quality-circle').forEach(b => b.classList.toggle('active', b.dataset.q === q));
  const servers = state.activeServers || [];
  
  let filtered = servers.filter(s => s.quality === q);
  if(filtered.length === 0) filtered = servers;

  document.getElementById('playerServersList').innerHTML = filtered.map(s => `
    <button class="server-select-btn" onclick="playServer('${s.url}')">
      <i class="fa-solid fa-server"></i> ${s.name} <span style="font-size:0.75rem;opacity:0.5;margin-right:auto;background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">${s.quality.toUpperCase()}</span>
    </button>
  `).join('');
};

window.playServer = function(url) {
  document.getElementById('serversSelectionOverlay').style.display = 'none';
  document.getElementById('mainVideoIframe').src = url;
  if(state.activeAnime) window.saveWatchHistoryItem(state.activeAnime, state.activeEpisodeIndex);
};

// ===== WATCH HISTORY SYSTEM (UNIFIED) =====
window.saveWatchHistoryItem = function(anime, epIndex) {
  if (!anime) return;
  if (!state.animeCache) state.animeCache = {};
  state.animeCache[anime.mal_id] = anime;

  let history = [];
  try {
    const s = localStorage.getItem('animeWatchHistory');
    if (s) history = JSON.parse(s);
  } catch(e) {}

  // Remove duplicate entries
  history = history.filter(item => {
    const id = item.mal_id || (item.anime && item.anime.mal_id);
    return id !== anime.mal_id;
  });

  const epNum = epIndex + 1;
  const today = new Date();

  // Create unified rich history record
  const historyItem = {
    mal_id: anime.mal_id,
    title: anime.title,
    poster: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || 'https://via.placeholder.com/300x400?text=No+Image',
    episodeIndex: epIndex,
    episodeNumber: epNum,
    timestamp: today.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
    lastWatched: Date.now(),
    progress: Math.floor(Math.random() * 30) + 60 // Simulated progress bar percentage
  };

  history.unshift(historyItem); // Add to top

  // Keep only the last 50 total
  if (history.length > 50) {
    history.pop();
  }

  localStorage.setItem('animeWatchHistory', JSON.stringify(history));

  // Sync rendering
  if (typeof window.renderWatchHistoryGrid === 'function') window.renderWatchHistoryGrid();
  if (typeof window.renderWatchHistoryGridSPA === 'function') window.renderWatchHistoryGridSPA();
};

window.renderWatchHistoryGrid = function() {
  let history = [];
  try {
    const stored = localStorage.getItem('animeWatchHistory');
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
  
  grid.innerHTML = history.slice(0, 6).map(item => {
    const poster = item.poster || item.anime?.images?.webp?.large_image_url || 'https://via.placeholder.com/300x400?text=No+Image';
    const title = item.title || item.anime?.title || 'أنمي';
    const id = item.mal_id || item.anime?.mal_id;
    const epNum = item.episodeNumber || (item.episodeIndex + 1);
    const progress = item.progress || 75;
    const dateStr = item.timestamp || new Date(item.lastWatched).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    
    return `
      <article class="anime-card history-card" data-id="${id}" onclick="window.resumeWatchHistory(${id}, ${item.episodeIndex})">
        <div class="card-img-wrapper">
          <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
          <div class="card-overlays">
            <span class="card-badge" style="background: #ff69b4; box-shadow: 0 0 10px rgba(255, 105, 180, 0.6); pointer-events: none;"><i class="fa-solid fa-clock"></i> ح ${epNum}</span>
          </div>
          <!-- Watch Duration Progress Bar Overlay -->
          <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 5px; background: rgba(255,255,255,0.15); z-index: 5;">
            <div style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, #ff69b4, #ff3333); box-shadow: 0 0 8px #ff69b4;"></div>
          </div>
        </div>
        <div class="card-info" style="padding: 12px;">
          <h3 class="card-title" onclick="window.resumeWatchHistory(${id}, ${item.episodeIndex})" style="font-size: 0.95rem; margin-bottom: 5px;">${title}</h3>
          <div class="card-meta-info" style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-sub);">
            <span style="font-size: 0.72rem; color: #ff69b4; font-weight: 700; cursor: pointer;"><i class="fa-solid fa-circle-play"></i> استئناف ح ${epNum}</span>
            <span style="font-size: 0.72rem; color: #888;">${dateStr}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
};

window.resumeWatchHistory = async function(malId, episodeIndex) {
  try {
    if (typeof window.openAnimeDetails === 'function') {
      await window.openAnimeDetails(malId);
      if (typeof window.openPlayerView === 'function') {
        await window.openPlayerView(episodeIndex);
      }
    }
  } catch(e) {
    console.error("Failed to resume watch history:", e);
  }
};

// ===== HERO OVERRIDE =====
// ===== HERO OVERRIDE (AUTOMATIC ROTATING CAROUSEL) =====
let heroSlides = [];
let currentHeroSlideIndex = 0;
let heroSliderInterval = null;

window.renderHeroBanner = function() {
  let sourceList = state.seasonalAnime.length > 0 ? state.seasonalAnime : state.popularAnime;
  if (!sourceList || sourceList.length === 0) return;
  
  heroSlides = sourceList.slice(0, 5); // Take the top 5 most popular anime
  
  if (heroSliderInterval) {
    clearInterval(heroSliderInterval);
  }

  const h = document.getElementById('heroBanner');
  if (!h) return;
  h.style.transition = 'background-image 0.8s ease-in-out, filter 0.5s ease-in-out';

  // Render first slide
  showHeroSlide(0);

  // Set interval to rotate every 6 seconds
  heroSliderInterval = setInterval(() => {
    currentHeroSlideIndex = (currentHeroSlideIndex + 1) % heroSlides.length;
    showHeroSlide(currentHeroSlideIndex);
  }, 6000);
};

function showHeroSlide(index) {
  const featured = heroSlides[index];
  if (!featured) return;

  const h = document.getElementById('heroBanner');
  if (!h) return;

  const poster = featured.trailer?.images?.maximum_image_url || featured.images?.webp?.large_image_url || featured.images?.jpg?.large_image_url;
  
  if (!state.animeCache) state.animeCache = {};
  state.animeCache[featured.mal_id] = featured;

  const content = document.querySelector('.hero-content');
  if (content) {
    content.style.transition = 'opacity 0.4s ease-in-out, transform 0.4s ease-in-out';
    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';
  }

  setTimeout(() => {
    h.style.backgroundImage = `url('${poster}')`;
    
    document.getElementById('heroSeason').textContent = featured.season ? `${featured.season} ${featured.year}` : featured.type;
    document.getElementById('heroTitle').textContent = featured.title_english || featured.title;
    document.getElementById('heroDesc').textContent = featured.synopsis ? featured.synopsis.substring(0, 200) + '...' : '';
    document.getElementById('heroRating').textContent = featured.score || 'N/A';
    document.getElementById('heroType').textContent = featured.type;
    document.getElementById('heroEpisodes').textContent = `${featured.episodes || '?'} حلقة`;

    document.getElementById('heroPlayBtn').onclick = () => openAnimeDetails(featured.mal_id);
    document.getElementById('heroSaveBtn').onclick = () => {
      toggleBookmark(featured);
      setTimeout(() => updateHeroBookmarkStateForSlide(featured.mal_id), 100);
    };

    updateHeroBookmarkStateForSlide(featured.mal_id);

    if (content) {
      content.style.opacity = '1';
      content.style.transform = 'translateY(0)';
    }
  }, 400);
}

function updateHeroBookmarkStateForSlide(malId) {
  const btn = document.getElementById('heroSaveBtn');
  if (!btn) return;
  const isSaved = state.savedAnimeIds.includes(malId);
  if (isSaved) {
    btn.innerHTML = `<i class="fa-solid fa-bookmark"></i> محفوظ`;
    btn.classList.add('saved');
  } else {
    btn.innerHTML = `<i class="fa-regular fa-bookmark"></i> حفظ`;
    btn.classList.remove('saved');
  }
}

window.renderSeasonalAnime = function() {
  if(!state.seasonalAnime.length) return;
  const grid = document.getElementById('seasonalGrid');
  if(!grid) return;
  grid.innerHTML = state.seasonalAnime.slice(0,6).map(a => createAnimeCardHTML(a)).join('');
  attachCardSaveEvents(grid);
};

// ===== AUTH SYSTEM =====
window.showAuthTab = function(tab) {
  currentAuthTab = tab;
  document.getElementById('tabLogin').style.background = tab==='login' ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)';
  document.getElementById('tabLogin').style.color = tab==='login' ? 'white' : 'var(--text-sub)';
  document.getElementById('tabRegister').style.background = tab==='register' ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)';
  document.getElementById('tabRegister').style.color = tab==='register' ? 'white' : 'var(--text-sub)';
  document.getElementById('avatarSection').style.display = tab==='register' ? 'block' : 'none';
  document.getElementById('authSubmitBtn').innerHTML = tab==='login' ? '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول' : '<i class="fa-solid fa-user-plus"></i> إنشاء حساب';
  document.getElementById('authError').style.display = 'none';
};

window.openAuthModal = function(forceEditMode = false) {
  const m = document.getElementById('authModal');
  if(m) m.classList.add('active');
  
  if(userState.isLoggedIn) {
     document.getElementById('authTabs').style.display = 'none';
     document.getElementById('avatarSection').style.display = 'none';
     document.getElementById('authInputsForm').style.display = 'none';
     document.getElementById('profileViewSection').style.display = 'block';
     document.getElementById('profileViewAvatar').src = userState.avatar;
     document.getElementById('profileViewUsername').textContent = userState.username;
     document.getElementById('authModalTitle').innerHTML = '<i class="fa-solid fa-user-check highlight"></i> ملفك الشخصي';
  } else {
     document.getElementById('authTabs').style.display = 'flex';
     document.getElementById('authInputsForm').style.display = 'flex';
     document.getElementById('profileViewSection').style.display = 'none';
     document.getElementById('authModalTitle').innerHTML = '<i class="fa-solid fa-user-gear highlight"></i> حسابي';
     showAuthTab('login');
  }
};

function closeAuthModal() {
  const m = document.getElementById('authModal');
  if(m) m.classList.remove('active');
}

async function handleAuth() {
  const user = document.getElementById('usernameInput').value.trim();
  const pass = document.getElementById('passwordInput').value.trim();
  const errEl = document.getElementById('authError');
  if(!user || !pass) { errEl.textContent = 'يرجى ملء جميع الحقول'; errEl.style.display = 'block'; return; }

  try {
    if(currentAuthTab === 'register') {
      const avatar = userState.selectedAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user}`;
      // Check if user already exists
      const users = JSON.parse(localStorage.getItem('anime_users') || '{}');
      if(users[user]) { errEl.textContent = 'اسم المستخدم موجود بالفعل'; errEl.style.display = 'block'; return; }
      // Register new user
      users[user] = { username: user, password: pass, avatar: avatar, id: Date.now() };
      localStorage.setItem('anime_users', JSON.stringify(users));
      userState.isLoggedIn = true; userState.username = user; userState.avatar = avatar; userState.userId = Date.now();
    } else {
      // Login with localStorage
      const users = JSON.parse(localStorage.getItem('anime_users') || '{}');
      if(!users[user] || users[user].password !== pass) { errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة'; errEl.style.display = 'block'; return; }
      userState.isLoggedIn = true; userState.username = user; userState.avatar = users[user].avatar; userState.userId = users[user].id;
    }
    localStorage.setItem('user_profile', JSON.stringify({username:userState.username, avatar:userState.avatar, userId:userState.userId}));
    closeAuthModal();
    if(typeof loadSavedListFromStorage === 'function') loadSavedListFromStorage();
    if(typeof renderProfileCard === 'function') renderProfileCard();
    if(typeof updateHeaderProfile === 'function') updateHeaderProfile();
    updateCommentFormVisibility();
  } catch(e) { errEl.textContent = 'حدث خطأ أثناء المصادقة'; errEl.style.display = 'block'; }
}

// ===== COMMENTS SYSTEM =====
function getEpisodeKey() {
  if(!state.activeAnime) return null;
  return `${state.activeAnime.mal_id}-${state.activeEpisodeIndex}`;
}

async function loadComments() {
  const key = getEpisodeKey();
  const container = document.getElementById('commentsContainer');
  if(!key || !container) return;
  container.innerHTML = '<div class="spinner" style="margin:10px auto;"></div>';
  updateCommentFormVisibility();
  try {
    const allComments = JSON.parse(localStorage.getItem('anime_comments') || '{}');
    const comments = allComments[key] || [];
    renderComments(comments);
  } catch(e) { container.innerHTML = '<p style="color:var(--text-sub);text-align:center;">تعذر تحميل التعليقات</p>'; }
}

window.toggleEmojiPicker = function() {
  const el = document.getElementById('emojiPickerContainer');
  if(el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
};

window.insertEmoji = function(emoji) {
  const input = document.getElementById('commentInput');
  if(!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;
  input.value = text.substring(0, start) + emoji + text.substring(end);
  input.focus();
  input.selectionStart = input.selectionEnd = start + emoji.length;
};

// Set replying comment state
window.setReplyTo = function(commentId, username) {
  replyToCommentId = commentId;
  const container = document.getElementById('replyingToIndicator');
  const userEl = document.getElementById('replyingToUsername');
  if (container && userEl) {
    userEl.textContent = '@' + username;
    container.style.display = 'flex';
  }
  const input = document.getElementById('commentInput');
  if(input) {
    input.placeholder = `اكتب ردك على @${username}...`;
    input.focus();
  }
};

window.cancelReply = function() {
  replyToCommentId = null;
  const container = document.getElementById('replyingToIndicator');
  if (container) container.style.display = 'none';
  const input = document.getElementById('commentInput');
  if(input) input.placeholder = "اكتب تعليقك هنا... (أو الصق صورة مباشرة!)";
};

window.deleteComment = async function(commentId) {
  if(!confirm("هل أنت متأكد من حذف تعليقك نهائياً؟")) return;
  const key = getEpisodeKey();
  try {
    const allComments = JSON.parse(localStorage.getItem('anime_comments') || '{}');
    if(allComments[key]) {
      allComments[key] = allComments[key].filter(c => c.id !== commentId);
      localStorage.setItem('anime_comments', JSON.stringify(allComments));
    }
    loadComments();
  } catch(e) {}
};

function renderComments(comments) {
  const container = document.getElementById('commentsContainer');
  if(!container) return;
  if(comments.length === 0) { container.innerHTML = '<p style="color:var(--text-sub);text-align:center;padding:20px;">لا توجد تعليقات بعد. كن أول من يعلق!</p>'; return; }
  
  container.innerHTML = comments.map(c => {
    const liked = c.likes && c.likes.includes(userState.userId);
    const likeCount = c.likes ? c.likes.length : 0;
    const time = new Date(c.createdAt).toLocaleString('ar-EG');
    const isOwner = c.userId === userState.userId;
    
    // Render nested replies
    let repliesHtml = '';
    if(c.replies && c.replies.length > 0) {
      repliesHtml = `
      <div class="replies-container" style="margin-top:10px; margin-right:20px; padding-right:12px; border-right:2px solid rgba(0, 168, 204, 0.2); display:flex; flex-direction:column; gap:8px;">
        ${c.replies.map(r => {
          const rTime = new Date(r.createdAt).toLocaleString('ar-EG');
          const isReplyOwner = r.userId === userState.userId;
          return `
          <div class="reply-item" style="display:flex; gap:10px; padding:8px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.03);">
            <img src="${r.avatar||''}" style="width:30px; height:30px; border-radius:50%; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:700; font-size:0.8rem; color:#f0f4ff;">${r.username}</span>
                <span style="font-size:0.7rem; color:var(--text-sub);">${rTime}</span>
              </div>
              <p style="font-size:0.85rem; line-height:1.5; color:#ddd; word-break:break-word;">${r.text}</p>
            </div>
            ${isReplyOwner ? `<button onclick="deleteComment('${r.id}')" style="background:none; border:none; color:#ff4757; cursor:pointer; font-size:0.8rem; align-self:flex-start; margin-right:5px;"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    }

    return `
    <div class="comment-item" style="display:flex; flex-direction:column; gap:8px; padding:12px; background:rgba(0,0,0,0.2); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex; gap:12px;">
        <img src="${c.avatar||''}" style="width:40px; height:40px; border-radius:50%; flex-shrink:0;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-weight:700; font-size:0.9rem; color:var(--accent-color);">${c.username}</span>
            <span style="font-size:0.75rem; color:var(--text-sub);">${time}</span>
          </div>
          <p style="font-size:0.9rem; line-height:1.6; margin-bottom:8px; word-break:break-word;">${c.text}</p>
          ${c.image ? `<img src="${c.image}" style="max-width:200px; border-radius:8px; margin-bottom:8px; cursor:pointer;" onclick="window.open('${c.image}')">` : ''}
          <div style="display:flex; gap:15px; align-items:center;">
            <button onclick="likeComment('${c.id}')" style="background:none; border:none; color:${liked?'#ff6b9d':'var(--text-sub)'}; cursor:pointer; font-family:inherit; font-size:0.85rem;">
              <i class="fa-${liked?'solid':'regular'} fa-heart"></i> ${likeCount}
            </button>
            <button onclick="setReplyTo('${c.id}', '${c.username}')" style="background:none; border:none; color:var(--accent-color); cursor:pointer; font-family:inherit; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-reply"></i> رد
            </button>
            ${isOwner ? `<button onclick="deleteComment('${c.id}')" style="background:none; border:none; color:#ff4757; cursor:pointer; font-family:inherit; font-size:0.85rem; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-trash"></i> حذف</button>` : ''}
          </div>
        </div>
      </div>
      ${repliesHtml}
    </div>`;
  }).join('');
}

function updateCommentFormVisibility() {
  const form = document.getElementById('commentFormArea');
  const msg = document.getElementById('commentLoginMsg');
  const input = document.getElementById('commentInput');
  if(!form) return;
  if(userState.isLoggedIn) {
    if(msg) msg.style.display = 'none';
    if(input) input.disabled = false;
  } else {
    if(msg) msg.style.display = 'block';
    if(input) input.disabled = true;
  }
}

window.submitComment = async function() {
  if(!userState.isLoggedIn) { openAuthModal(); return; }
  const text = document.getElementById('commentInput').value.trim();
  if(!text && !commentImageBase64) return;
  const key = getEpisodeKey();
  if(!key) return;

  let imageUrl = '';
  if(commentImageBase64) {
    imageUrl = commentImageBase64;
  }

  try {
    const allComments = JSON.parse(localStorage.getItem('anime_comments') || '{}');
    if(!allComments[key]) allComments[key] = [];
    const newComment = {
      id: Date.now().toString(),
      userId: userState.userId,
      username: userState.username,
      avatar: userState.avatar,
      text,
      image: imageUrl,
      parentId: replyToCommentId,
      createdAt: new Date().toISOString(),
      likes: []
    };
    if(replyToCommentId) {
      const parentComment = allComments[key].find(c => c.id === replyToCommentId);
      if(parentComment) {
        if(!parentComment.replies) parentComment.replies = [];
        parentComment.replies.push(newComment);
      }
    } else {
      allComments[key].push(newComment);
    }
    localStorage.setItem('anime_comments', JSON.stringify(allComments));
    document.getElementById('commentInput').value = '';
    cancelReply();
    clearCommentImage();
    loadComments();
  } catch(e) {}
};

window.likeComment = async function(commentId) {
  if(!userState.isLoggedIn) { openAuthModal(); return; }
  const key = getEpisodeKey();
  try {
    const allComments = JSON.parse(localStorage.getItem('anime_comments') || '{}');
    if(allComments[key]) {
      const comment = allComments[key].find(c => c.id === commentId);
      if(comment) {
        if(!comment.likes) comment.likes = [];
        const likeIndex = comment.likes.indexOf(userState.userId);
        if(likeIndex === -1) {
          comment.likes.push(userState.userId);
        } else {
          comment.likes.splice(likeIndex, 1);
        }
        localStorage.setItem('anime_comments', JSON.stringify(allComments));
      }
    }
    loadComments();
  } catch(e) {}
};

window.clearCommentImage = function() {
  commentImageBase64 = '';
  document.getElementById('commentImagePreview').style.display = 'none';
  document.getElementById('commentImageUpload').value = '';
};

// ===== LATEST SEASONAL EPISODES SYSTEM (UNIFIED) =====
window.renderLatestEpisodes = async function() {
  const grid = document.getElementById('latestEpisodesGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';

  try {
    // 1. Fetch Jikan's real-time watch episodes (latest actual updates)
    let watchEpisodesMap = {};
    try {
      const res = await fetch('https://api.jikan.moe/v4/watch/episodes');
      if (res.ok) {
        const jikanData = await res.json();
        const watchItems = jikanData.data || [];
        watchItems.forEach(item => {
          const malId = item.entry.mal_id;
          let epStr = item.episodes && item.episodes.length > 0 ? item.episodes[0].title : "الحلقة 1";
          let epNum = parseInt(epStr.match(/\d+/)) || 1;
          if (!watchEpisodesMap[malId] || epNum > watchEpisodesMap[malId]) {
            watchEpisodesMap[malId] = epNum;
          }
        });
      }
    } catch(err) {
      console.warn("Jikan watch/episodes real-time fetch failed, using scheduler fallback:", err);
    }

    // 2. Fetch seasonal anime (ongoing currently airing anime)
    let seasonal = state.seasonalAnime || [];
    if (seasonal.length === 0) {
      const sRes = await fetch('https://api.jikan.moe/v4/seasons/now');
      const sData = await sRes.json();
      seasonal = sData.data || [];
      state.seasonalAnime = seasonal;
    }

    if (seasonal.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-sub); text-align:center;">لا توجد حلقات متاحة حالياً.</p>';
      return;
    }

    // 3. Map and process seasonal anime
    const processedEpisodes = seasonal.map(anime => {
      // Get the exact correct episode number from the real-time updates map
      let epNum = watchEpisodesMap[anime.mal_id];
      
      // If Jikan watch updates map doesn't have it, calculate using a safe weekly algorithm
      if (!epNum) {
        epNum = 1;
        if (anime.aired && anime.aired.from) {
          const start = new Date(anime.aired.from);
          const now = new Date();
          if (now > start) {
            const diffMs = now - start;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            epNum = Math.floor(diffDays / 7) + 1;
          }
        }
        if (anime.episodes && epNum > anime.episodes) {
          epNum = anime.episodes;
        }
        if (epNum < 1) epNum = 1;
      }

      // Cache details
      if (!state.animeCache) state.animeCache = {};
      state.animeCache[anime.mal_id] = anime;

      // Localize broadcast days in Arabic
      let dayArabic = '';
      if (anime.broadcast && anime.broadcast.day) {
        const daysMap = {
          'Mondays': 'الإثنين', 'Tuesdays': 'الثلاثاء', 'Wednesdays': 'الأربعاء',
          'Thursdays': 'الخميس', 'Fridays': 'الجمعة', 'Saturdays': 'السبت', 'Sundays': 'الأحد'
        };
        const dayEng = anime.broadcast.day;
        for (const [key, value] of Object.entries(daysMap)) {
          if (dayEng.toLowerCase().includes(key.toLowerCase().substring(0, 5))) {
            dayArabic = value;
            break;
          }
        }
      }

      const statusText = anime.status === 'Currently Airing' ? 'مستمر' : 'مكتمل';
      
      return {
        anime,
        epNum,
        dayArabic,
        statusText,
        priority: watchEpisodesMap[anime.mal_id] ? 2 : 1 // Recent updates are prioritized to the top
      };
    });

    // Sort to place recent active weekly releases at the top of the grid!
    processedEpisodes.sort((a, b) => b.priority - a.priority);

    // Render the top 8 seasonal episodes
    grid.innerHTML = processedEpisodes.slice(0, 8).map(item => {
      const anime = item.anime;
      const epNum = item.epNum;
      const releaseText = item.dayArabic ? `حلقة جديدة كل ${item.dayArabic}` : 'أضيف هذا الأسبوع';
      const poster = anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || 'https://via.placeholder.com/300x400?text=No+Image';
      
      const badgeColor = item.statusText === 'مستمر' ? '#00FF66' : '#a8a8a8';
      const borderGlow = item.statusText === 'مستمر' ? 'rgba(0, 255, 102, 0.4)' : 'rgba(168, 168, 168, 0.4)';

      return `
        <article class="anime-card episode-card" data-id="${anime.mal_id}">
          <div class="card-img-wrapper" onclick="window.openLatestEpisode(${anime.mal_id}, ${epNum - 1})">
            <img src="${poster}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'">
            <div class="card-overlays">
              <span class="card-badge" style="background: #00a8cc; box-shadow: 0 0 10px rgba(0, 168, 204, 0.6); pointer-events: none;"><i class="fa-solid fa-play"></i> الحلقة ${epNum}</span>
              <span class="card-status-badge" style="position: absolute; top: 10px; right: 10px; background: rgba(6, 8, 16, 0.85); border: 1px solid ${badgeColor}; box-shadow: 0 0 8px ${borderGlow}; color: ${badgeColor}; font-size: 0.68rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; display: flex; align-items: center; gap: 5px; pointer-events: none;">
                <span style="display:inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${badgeColor}; box-shadow: 0 0 6px ${badgeColor};"></span> ${item.statusText}
              </span>
            </div>
          </div>
          <div class="card-info" style="padding: 12px;">
            <h3 class="card-title" onclick="window.openLatestEpisode(${anime.mal_id}, ${epNum - 1})" style="font-size: 0.95rem; margin-bottom: 5px;">${anime.title}</h3>
            <div class="card-meta-info" style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-sub);">
              <span style="font-size: 0.72rem; color: var(--accent-color); font-weight: 700;"><i class="fa-solid fa-calendar-day"></i> ${releaseText}</span>
              <span style="font-size: 0.72rem; color: #888;">منذ أيام</span>
            </div>
          </div>
        </article>
      `;
    }).join('');

  } catch(e) {
    console.error("Latest episodes render failed:", e);
    grid.innerHTML = '<p style="color:var(--text-sub); text-align:center;">تعذر تحميل الحلقات</p>';
  }
};

// ===== FAST DYNAMIC WITANIME SCRAPER & DECRYPTOR OVERRIDE =====
window.getWitanimeEpisodes = async function(anime) {
  const searchTitles = [];
  if (anime.title) searchTitles.push(anime.title);
  if (anime.title_english) searchTitles.push(anime.title_english);
  
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port;

  async function fetchHTML(url) {
    if (isLocal) {
      const res = await fetch('/api/proxy?url=' + encodeURIComponent(url));
      if (res.ok) return await res.text();
    } else {
      const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url));
      if (res.ok) {
        const d = await res.json();
        return d.contents || '';
      }
    }
    throw new Error('Fetch failed');
  }

  for (const title of searchTitles.slice(0, 2)) {
    try {
      const searchUrl = `https://witanime.you/?search_param=animes&s=${encodeURIComponent(title)}`;
      const html = await fetchHTML(searchUrl);
      const regex = /<a\s+href="(https:\/\/witanime\.you\/anime\/[^"]+)"\s+class="overlay"><\/a>/i;
      const match = html.match(regex);
      if (match && match[1]) {
        const animeUrl = match[1];
        const animeHtml = await fetchHTML(animeUrl);
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
      console.warn(`Fast Witanime extraction failed for title "${title}":`, e);
    }
  }
  return [];
};

// ===== USER PROFILE EDITOR CONTROLLER (NEW FEATURE) =====
let profileSelectedAvatar = '';

window.toggleProfileEdit = function(show = true) {
  const container = document.getElementById('profileEditContainer');
  const btnShow = document.getElementById('btnShowProfileEdit');
  const usernameInput = document.getElementById('profileEditUsernameInput');
  const errEl = document.getElementById('profileEditError');

  if (!container || !btnShow) return;

  if (show) {
    container.style.display = 'flex';
    btnShow.style.display = 'none';
    errEl.style.display = 'none';
    usernameInput.value = userState.username || '';
    profileSelectedAvatar = userState.avatar || '';
    
    // Highlight currently active avatar
    document.querySelectorAll('.profile-avatar-option-img').forEach(img => {
      const active = img.dataset.avatar === profileSelectedAvatar;
      img.style.borderColor = active ? 'var(--accent-color)' : 'transparent';
      img.style.transform = active ? 'scale(1.1)' : 'scale(1)';
      img.style.boxShadow = active ? '0 0 10px var(--accent-color)' : 'none';
    });
  } else {
    container.style.display = 'none';
    btnShow.style.display = 'block';
  }
};

// Bind clicks on custom avatars
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('profile-avatar-option-img')) {
    profileSelectedAvatar = e.target.dataset.avatar;
    document.querySelectorAll('.profile-avatar-option-img').forEach(img => {
      const active = img.dataset.avatar === profileSelectedAvatar;
      img.style.borderColor = active ? 'var(--accent-color)' : 'transparent';
      img.style.transform = active ? 'scale(1.1)' : 'scale(1)';
      img.style.boxShadow = active ? '0 0 10px var(--accent-color)' : 'none';
    });
  }
});

window.saveProfileChanges = async function() {
  const newUsername = document.getElementById('profileEditUsernameInput').value.trim();
  const errEl = document.getElementById('profileEditError');
  
  if (!newUsername) {
    errEl.textContent = 'اسم المستخدم لا يمكن أن يكون فارغاً';
    errEl.style.display = 'block';
    return;
  }

  try {
    let success = false;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port;

    if (isLocal) {
      // Direct call to our custom PowerShell update endpoint!
      const res = await fetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userState.userId,
          username: newUsername,
          avatar: profileSelectedAvatar
        })
      });
      const data = await res.json();
      if (data.success) {
        userState.username = data.user.username;
        userState.avatar = data.user.avatar;
        success = true;
      } else {
        errEl.textContent = data.error || 'اسم المستخدم محجوز بالفعل';
        errEl.style.display = 'block';
        return;
      }
    }

    // Sync localStorage local user db
    const users = JSON.parse(localStorage.getItem('anime_users') || '{}');
    if (userState.username !== newUsername && users[userState.username]) {
      const userData = users[userState.username];
      delete users[userState.username];
      userData.username = newUsername;
      userData.avatar = profileSelectedAvatar;
      users[newUsername] = userData;
    } else if (users[userState.username]) {
      users[userState.username].avatar = profileSelectedAvatar;
    } else {
      users[newUsername] = { username: newUsername, avatar: profileSelectedAvatar, id: userState.userId || Date.now() };
    }
    localStorage.setItem('anime_users', JSON.stringify(users));

    if (!success) {
      // Offline fallback
      userState.username = newUsername;
      userState.avatar = profileSelectedAvatar;
    }

    // Sync session
    localStorage.setItem('user_profile', JSON.stringify({
      username: userState.username,
      avatar: userState.avatar,
      userId: userState.userId
    }));

    // Dynamic UI Update
    document.getElementById('profileViewAvatar').src = userState.avatar;
    document.getElementById('profileViewUsername').textContent = userState.username;
    
    if (typeof renderProfileCard === 'function') renderProfileCard();
    if (typeof updateHeaderProfile === 'function') updateHeaderProfile();
    updateCommentFormVisibility();

    window.toggleProfileEdit(false);

    // GORGEOUS dynamic header alert animation!
    const titleEl = document.getElementById('authModalTitle');
    const originalHTML = titleEl.innerHTML;
    titleEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#00FF66; filter:drop-shadow(0 0 5px #00FF66);"></i> تم الحفظ بنجاح!';
    setTimeout(() => { titleEl.innerHTML = originalHTML; }, 2000);

  } catch (e) {
    errEl.textContent = 'حدث خطأ أثناء الاتصال بالسيرفر';
    errEl.style.display = 'block';
    console.error(e);
  }
};
