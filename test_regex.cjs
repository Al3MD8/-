const fs = require('fs');
const html = fs.readFileSync('ep.html', 'utf8');
const rx = /data-server-id="(\d+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/g;
let m;
while((m=rx.exec(html))!==null) {
    console.log(m[1], m[2]);
}
