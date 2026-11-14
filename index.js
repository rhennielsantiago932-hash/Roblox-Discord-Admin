require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once(Events.ClientReady, (bot) => {
 console.log(`Ranking Bot Online: ${bot.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
