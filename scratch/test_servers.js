import fs from 'fs';

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

async function run() {
  try {
    // 1. Fetch anime page to get episode data
    const animeUrl = "https://witanime.you/anime/ao-no-hako/";
    const res = await fetch(animeUrl);
    const html = await res.text();
    
    const epDataMatch = html.match(/var\s+processedEpisodeData\s*=\s*'([^']+)';/);
    if (!epDataMatch) {
      console.log("No processedEpisodeData!");
      return;
    }
    
    const episodes = decryptWitanimeEpisodes(epDataMatch[1]);
    console.log("Number of episodes found:", episodes.length);
    if (episodes.length === 0) return;
    
    // Get first episode
    const ep = episodes[0];
    console.log("First episode info:", ep);
    
    // 2. Fetch first episode page HTML
    const epRes = await fetch(ep.url);
    const epHtml = await epRes.text();
    console.log("Episode HTML length:", epHtml.length);
    
    // Extract _zG and _zH
    const zG_m = epHtml.match(/var _zG\s*=\s*"([^"]+)";/);
    const zH_m = epHtml.match(/var _zH\s*=\s*"([^"]+)";/);
    
    if (!zG_m || !zH_m) {
      console.log("No _zG or _zH matches in episode page!");
      return;
    }
    
    const zG = JSON.parse(atob(zG_m[1]));
    const zH = JSON.parse(atob(zH_m[1]));
    
    console.log("zG length:", zG.length);
    console.log("zH length:", zH.length);
    
    let m;
    const rx = /data-server-id="(\d+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/g;
    const servers = [];
    while ((m = rx.exec(epHtml)) !== null) {
      const serverId = parseInt(m[1]);
      const serverName = m[2].trim();
      const decryptedUrl = decryptWitanimeServer(zG[serverId], zH[serverId]);
      servers.push({ id: serverId, name: serverName, url: decryptedUrl });
    }
    
    console.log("Parsed servers count:", servers.length);
    console.log("Servers found:", servers);
  } catch(e) {
    console.error(e);
  }
}
run();
