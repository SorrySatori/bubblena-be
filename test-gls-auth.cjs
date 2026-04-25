const crypto = require('crypto');
const axios = require('axios');

function hash(pw) {
  return Array.from(crypto.createHash('sha512').update(Buffer.from(pw, 'utf8')).digest());
}

const pw = 'Spejlekalash1';
const usernames = ['petrikovahedvika@gmail.com', '53013682', 'info@bubblena.cz'];
const urls = [
  ['prod', 'https://api.mygls.cz/ParcelService.svc/json/PrepareLabels'],
  ['test', 'https://api.test.mygls.cz/ParcelService.svc/json/PrepareLabels'],
];

(async () => {
  for (const [env, url] of urls) {
    for (const u of usernames) {
      try {
        const res = await axios.post(url, { Username: u, Password: hash(pw), ParcelList: [] }, { headers: { 'Content-Type': 'application/json' } });
        const err = res.data.PrepareLabelsError;
        const ok = !err || err.length === 0;
        console.log(env + ' | ' + u + ': ' + (ok ? 'AUTH OK' : err[0].ErrorDescription));
      } catch (e) {
        console.log(env + ' | ' + u + ': NETWORK ERROR ' + (e.response ? e.response.status : e.message));
      }
    }
  }
})();
