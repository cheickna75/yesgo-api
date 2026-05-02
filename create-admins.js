require('dotenv').config();
require('./src/models');
const { User } = require('./src/models');
const { connectDB } = require('./src/config/database');

const ADMINS = [
  { nom: 'Admin YesGo', telephone: '+22376351993', mot_de_passe: 'MohamedCISSE75020' },
  { nom: 'Admin YesGo 2', telephone: '+22382785180', mot_de_passe: 'MohamedCISSE75020' },
];

(async () => {
  await connectDB();

  for (const data of ADMINS) {
    const existant = await User.findOne({ where: { telephone: data.telephone } });
    if (existant) {
      await existant.update({ est_admin: true, mot_de_passe: data.mot_de_passe });
      console.log(`✅ Compte promu admin et mot de passe mis à jour : ${data.telephone}`);
    } else {
      await User.create({ ...data, est_admin: true, est_conducteur: false });
      console.log(`✅ Admin créé : ${data.telephone}`);
    }
  }

  process.exit(0);
})();
