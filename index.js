require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const {
  ROBLOX_GROUP_ID,
  DISCORD_GUILD_ID,
  DISCORD_CLIENT_ID
} = require("./config");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Verify your Roblox group membership")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Your Roblox username")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("code")
      .setDescription("Your Roblox verification code")
      .setRequired(false)
  );

client.once(Events.ClientReady, async (bot) => {
  console.log("Ranking Bot Online: " + bot.user.tag);

  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_TOKEN
    );

    await rest.put(
      Routes.applicationGuildCommands(
        DISCORD_CLIENT_ID,
        DISCORD_GUILD_ID
      ),
      {
        body: [verifyCommand.toJSON()]
      }
    );

    console.log("/verify COMMAND REGISTERED!");

  } catch (error) {
    console.error("COMMAND REGISTRATION FAILED!");
    console.error(error.message);
  }

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
      throw new Error("Roblox API Error: " + response.status);
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

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "verify") {
    await interaction.reply({
      content: "The verification system is being set up. Please try again later!",
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
