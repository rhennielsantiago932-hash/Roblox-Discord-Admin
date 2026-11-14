require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events
} = require("discord.js");

const {
  ROBLOX_GROUP_ID
} = require("./config");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async (bot) => {
  console.log("Ranking Bot Online: " + bot.user.tag);

  try {
    const apiKey = process.env.ROBLOX_API_KEY;

    if (!apiKey) {
      throw new Error("ROBLOX_API_KEY is missing!");
    }

    const response = await fetch(
      "https://apis.roblox.com/cloud/v2/groups/" +
      ROBLOX_GROUP_ID,
      {
        headers: {
          "x-api-key": apiKey
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "Roblox API Error: " + response.status
      );
    }

    const group = await response.json();

    console.log("ROBLOX CONNECTION SUCCESS!");
    console.log("Group ID: " + ROBLOX_GROUP_ID);
    console.log("Group Name: " + group.name);

  } catch (error) {
    console.error("ROBLOX CONNECTION FAILED!");
    console.error(error.message);
  }
});

client.login(process.env.DISCORD_TOKEN);
