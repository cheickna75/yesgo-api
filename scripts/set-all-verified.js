require('dotenv').config();
const { connectDB } = require('../src/config/database');
const { User } = require('../src/models');

(async () => {
  await connectDB();
  const [count] = await User.update({ is_verifie: true }, { where: {} });
  console.log(`✅ ${count} utilisateur(s) mis à jour — is_verifie: true`);
  process.exit(0);
})();
