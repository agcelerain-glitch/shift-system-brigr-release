// set-claims.js （ローカルで node set-claims.js として実行）
const admin = require('firebase-admin');
const serviceAccount = require('./shift-system-brigr-firebase.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function setRole(email, role) {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role });
  console.log(`${email} -> ${role}`);
}

(async () => {
  await setRole('harukiyoshida63636633@gmail.com', 'user');
  await setRole('agcelerain63636633@gmail.com', 'admin');
})();
