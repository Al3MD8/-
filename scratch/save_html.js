import fs from 'fs';

async function saveHtml() {
  try {
    const searchUrl = `https://witanime.you/?search_param=animes&s=${encodeURIComponent("Blue Box")}`;
    const res = await fetch(searchUrl);
    const html = await res.text();
    fs.writeFileSync('scratch/search_page.html', html, 'utf8');
    console.log("Saved HTML, length:", html.length);
  } catch(e) {
    console.error(e);
  }
}
saveHtml();
