async function checkAnimePage(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    console.log("Anime Page HTML length:", html.length);
    
    // Search for processedEpisodeData
    const epDataMatch = html.match(/var\s+processedEpisodeData\s*=\s*'([^']+)';/);
    if (epDataMatch) {
      console.log("Found processedEpisodeData! Length:", epDataMatch[1].length);
    } else {
      console.log("NOT FOUND processedEpisodeData in HTML!");
      // Let's search for "processed" or "Episode" or "Data" in the HTML to see what variables exist
      const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
      console.log("Number of script tags:", scripts.length);
      // Look for variables in scripts
      const matches = html.match(/var\s+[^;=]+=\s*[^;]+/g);
      console.log("Some var declarations:", matches ? matches.slice(0, 20) : "none");
    }
  } catch(e) {
    console.error(e);
  }
}
checkAnimePage("https://witanime.you/anime/ao-no-hako/");
