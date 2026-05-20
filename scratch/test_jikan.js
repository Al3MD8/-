async function getJikanTitles(malId) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    const data = await res.json();
    const anime = data.data;
    console.log("MAL ID:", malId);
    console.log("title:", anime.title);
    console.log("title_english:", anime.title_english);
    console.log("title_japanese:", anime.title_japanese);
    console.log("title_synonyms:", anime.title_synonyms);
    console.log("titles:", anime.titles);
  } catch(e) {
    console.error(e);
  }
}
getJikanTitles(57181); // Blue Box MAL ID
