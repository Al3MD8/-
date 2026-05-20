async function testWitanime(title) {
  try {
    const searchUrl = `https://witanime.you/?search_param=animes&s=${encodeURIComponent(title)}`;
    console.log(`Searching for "${title}"...`);
    const res = await fetch(searchUrl);
    const html = await res.text();
    
    const regex = /<a\s+href="(https:\/\/witanime\.you\/anime\/[^"]+)"\s+class="overlay"><\/a>/i;
    const match = html.match(regex);
    if (match) {
      console.log(`FOUND for "${title}":`, match[1]);
      return true;
    } else {
      console.log(`NOT FOUND for "${title}"`);
      return false;
    }
  } catch (e) {
    console.error(`Error for "${title}":`, e);
    return false;
  }
}

async function run() {
  await testWitanime("Ao no Hako");
  await testWitanime("Blue Box");
  await testWitanime("One Piece");
  await testWitanime("Naruto");
}
run();
