async function viewSearch(title) {
  try {
    const searchUrl = `https://witanime.you/?search_param=animes&s=${encodeURIComponent(title)}`;
    const res = await fetch(searchUrl);
    const html = await res.text();
    console.log("HTML length:", html.length);
    
    // Find all links containing witanime.you/anime/
    const rx = /href="(https:\/\/witanime\.you\/anime\/[^"]+)"/g;
    let m;
    const links = [];
    while ((m = rx.exec(html)) !== null) {
      links.push(m[1]);
    }
    console.log("Found links matching witanime.you/anime/:", links);
    
    // Let's print all class names for the links or any div class containing them
    // to see if the structure of search results has changed.
    const containerRx = /<div class="anime-card-container">([\s\S]*?)<\/div>/g;
    const matches = html.match(/<div class="[^"]+">/g);
    console.log("Some div classes:", matches ? matches.slice(0, 15) : "none");
  } catch (e) {
    console.error("Error:", e);
  }
}

viewSearch("Blue Box");
