require("dotenv").config();

const crypto = require("crypto");

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
  DISCORD_CLIENT_ID,
  RANKS
} = require("./config");

const {
  getRobloxUser,
  getRobloxProfile,
  getGroupMember
} = require("./roblox");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const pendingVerifications = new Map();

const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Verify your Roblox account and group rank")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Your Roblox username")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("code")
      .setDescription("Your verification code")
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
    const response = await fetch(
      "https://apis.roblox.com/cloud/v2/groups/" +
      ROBLOX_GROUP_ID,
      {
        headers: {
          "x-api-key": process.env.ROBLOX_API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error("Roblox API Error: " + response.status);
    }

    const group = await response.json();

    console.log("ROBLOX CONNECTION SUCCESS!");
    console.log("Group Name: " + group.name);
  } catch (error) {
    console.error("ROBLOX CONNECTION FAILED!");
    console.error(error.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "verify") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const username = interaction.options.getString("username").trim();
    const code = interaction.options.getString("code");

    // STEP 1: Generate verification code
    if (!code) {
      const user = await getRobloxUser(username);

      if (!user) {
        return interaction.editReply(
          "Roblox account not found. Check your username."
        );
      }

      const verificationCode = crypto
        .randomInt(100000, 1000000)
        .toString();

      pendingVerifications.set(interaction.user.id, {
        username: user.name,
        userId: user.id,
        code: verificationCode,
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      return interaction.editReply(
        "Your verification code is: **" +
        verificationCode +
        "**\n\nPut this code in your Roblox profile description. " +
        "Then run /verify again using your username and code. " +
        "The code expires in 10 minutes."
      );
    }

    // STEP 2: Check pending verification
    const pending = pendingVerifications.get(interaction.user.id);

    if (!pending || Date.now() > pending.expiresAt) {
      pendingVerifications.delete(interaction.user.id);

      return interaction.editReply(
        "Your verification code expired or was not found. " +
        "Run /verify again without a code to get a new one."
      );
    }

    if (
      pending.username.toLowerCase() !== username.toLowerCase() ||
      pending.code !== code.trim()
    ) {
      return interaction.editReply(
        "Incorrect username or verification code."
      );
    }

    // STEP 3: Check Roblox profile description
    const profile = await getRobloxProfile(pending.userId);

    if (!String(profile.description || "").includes(pending.code)) {
      return interaction.editReply(
        "I cannot find your code in your Roblox profile description. " +
        "Add it and try again."
      );
    }

    // STEP 4: Check Roblox group membership
    const membership = await getGroupMember(pending.userId);

    if (!membership) {
      return interaction.editReply(
        "You are not a member of our Roblox group yet. " +
        "Join the group first, then try again."
      );
    }

    // STEP 5: Identify matching Roblox rank
    const rolePaths = Array.isArray(membership.roles)
      ? [...membership.roles]
      : [];

    if (membership.role) {
      rolePaths.unshift(membership.role);
    }

    const matchedRank = Object.entries(RANKS).find(
      ([rankName, roleId]) =>
        rolePaths.some(
          path =>
            String(path).split("/").pop() === String(roleId)
        )
    );

    // STEP 6: Find Discord roles
    const verifiedRole = interaction.guild.roles.cache.find(
      role => role.name === "Verified"
    );

    if (!verifiedRole) {
      return interaction.editReply(
        "Discord Verified role was not found."
      );
    }

    let rankRole = null;

    if (matchedRank) {
      const rankName = matchedRank[0]
        .toLowerCase()
        .split("_")
        .map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(" ");

      rankRole = interaction.guild.roles.cache.find(
        role => role.name === rankName
      );

      if (!rankRole) {
        return interaction.editReply(
          "Discord rank role not found: " + rankName
        );
      }
    }

    // STEP 7: Give Discord roles
    const member = await interaction.guild.members.fetch(
      interaction.user.id
    );

    await member.roles.add(verifiedRole);

    if (rankRole) {
      await member.roles.add(rankRole);
    }

    pendingVerifications.delete(interaction.user.id);

    return interaction.editReply(
      "Verification successful!\n" +
      "Roblox Username: **" + pending.username + "**\n" +
      "Discord Role: *Verified*" +
      (rankRole ? "\nRank: *" + rankRole.name + "*" : "")
    );

  } catch (error) {
    console.error("VERIFY ERROR:", error);

    return interaction.editReply(
      "Verification failed. Please try again later."
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
