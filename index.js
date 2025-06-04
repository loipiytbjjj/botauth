require('dotenv').config(); // Charger les variables d'environnement

const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');
const app = express();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const EXTERNAL_URL = process.env.EXTERNAL_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

let db = { users: [] };

if (fs.existsSync('./db.json')) {
  db = JSON.parse(fs.readFileSync('./db.json'));
}

// Fonction ping automatique
async function ping() {
  try {
    const res = await fetch(`http://localhost:${PORT}`);
    if (res.ok) {
      console.log(`Ping réussi à ${new Date().toLocaleTimeString()}`);
    } else {
      console.log(`Ping échoué avec le status: ${res.status}`);
    }
  } catch (error) {
    console.error('Erreur lors du ping:', error.message);
  }
}
setInterval(ping, 300000);
ping();

client.once('ready', async () => {
  const commands = [
    new SlashCommandBuilder()
      .setName('auth')
      .setDescription('Authentifie l’utilisateur via OAuth2'),

    new SlashCommandBuilder()
      .setName('join')
      .setDescription('Fait rejoindre des utilisateurs authentifiés')
      .addIntegerOption(option =>
        option.setName('nombre').setDescription('Nombre d’utilisateurs à ajouter').setRequired(true)
      )
  ];

  await client.application.commands.set(commands);
  console.log(`Bot prêt: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'auth') {
    const embed = new EmbedBuilder()
      .setTitle('Connexion nécessaire')
      .setDescription('Clique pour t’authentifier.')
      .setColor('Blue');

    const button = new ButtonBuilder()
      .setLabel('S’authentifier')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`);

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(button)],
      ephemeral: false,
    });
  }

  if (interaction.commandName === 'join') {
    const nombre = interaction.options.getInteger('nombre');

    if (db.users.length === 0) {
      await interaction.reply({ content: 'Aucun utilisateur authentifié.', ephemeral: true });
      return;
    }

    const usersToJoin = db.users.slice(0, nombre);

    for (const user of usersToJoin) {
      try {
        await fetch(`https://discord.com/api/v10/guilds/${interaction.guild.id}/members/${user.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ access_token: user.access_token })
        });
      } catch (err) {
        console.error(`Erreur ajout utilisateur ${user.id}:`, err.message);
      }
    }

    await interaction.reply({ content: `${usersToJoin.length} utilisateurs ont été ajoutés.`, ephemeral: true });
  }
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('Code manquant.');

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', REDIRECT_URI);

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const userData = await userResponse.json();

    db.users.push({ id: userData.id, access_token: tokenData.access_token });
    fs.writeFileSync('./db.json', JSON.stringify(db, null, 2));

    res.redirect(EXTERNAL_URL);
  } catch (err) {
    console.error('Erreur OAuth2:', err.message);
    res.status(500).send('Erreur OAuth2');
  }
});

app.listen(PORT, () => console.log(`Serveur OAuth2 sur http://localhost:${PORT}`));

client.login(BOT_TOKEN);
