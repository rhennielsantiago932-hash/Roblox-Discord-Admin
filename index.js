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
  DISCORD_OWNER_ROLE_ID,
  RANKS
} = require("./config");

const {
  getRobloxUser,
  getRobloxProfile,
  getGroupMember,
  assignGroupRole,
  unassignGroupRole
} = require("./roblox");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const pendingVerifications = new Map();

// Rank choices
const rankChoices = [
  { name: "Owner", value: "OWNER" },
  { name: "Developer", value: "DEVELOPER" },
  { name: "Admin", value: "ADMIN" },
  { name: "Staff Team", value: "STAFF_TEAM" },
  { name: "Vendor", value: "VENDOR" }
];

// Convert rank key to Discord role name
function getDiscordRankName(rankName) {
  return rankName
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Verify command
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

// Promote command
const promoteCommand = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Promote a Roblox group member")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Roblox username of the member")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("rank")
      .setDescription("Choose the target rank")
      .setRequired(true)
      .addChoices(...rankChoices)
  );

// Demote command
const demoteCommand = new SlashCommandBuilder()
  .setName("demote")
  .setDescription("Demote a Roblox group member")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Roblox username of the member")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("rank")
      .setDescription("Choose the target rank")
      .setRequired(true)
      .addChoices(...rankChoices)
  );

client.once(Events.ClientReady, async bot => {
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
        body: [
          verifyCommand.toJSON(),
          promoteCommand.toJSON(),
          demoteCommand.toJSON()
        ]
      }
    );

    console.log("SLASH COMMANDS REGISTERED!");
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

// Handle rank changes
async function changeMemberRank(interaction, action) {
  const username = interaction.options
    .getString("username")
    .trim();

  const targetRank = interaction.options.getString("rank");
  const targetRoleId = RANKS[targetRank];

  if (!targetRoleId) {
    return interaction.editReply("Invalid target rank.");
  }

  // Check target Discord rank role before changing Roblox
  const targetDiscordRoleName = getDiscordRankName(targetRank);

  const targetDiscordRole = interaction.guild.roles.cache.find(
    role => role.name === targetDiscordRoleName
  );

  if (!targetDiscordRole) {
    return interaction.editReply(
      "Discord rank role not found: " + targetDiscordRoleName
    );
  }

  // Find Roblox account
  const user = await getRobloxUser(username);

  if (!user) {
    return interaction.editReply(
      "Roblox account not found. Check the username."
    );
  }

  // Check group membership
  const membership = await getGroupMember(user.id);

  if (!membership) {
    return interaction.editReply(
      "That Roblox user is not a member of our group."
    );
  }

  // Roblox membership resource uses users/{userId}
  if (!membership.user) {
    return interaction.editReply(
      "Could not read the Roblox membership user ID."
    );
  }

  const membershipId = membership.user.split("/").pop();

  // Read all current roles
  const currentRolePaths = Array.isArray(membership.roles)
    ? membership.roles
    : membership.role
      ? [membership.role]
      : [];

  const currentRoleIds = currentRolePaths.map(
    path => String(path).split("/").pop()
  );

  const managedRankIds = Object.values(RANKS).map(String);

  const oldRankIds = managedRankIds.filter(
    id =>
      currentRoleIds.includes(id) &&
      id !== String(targetRoleId)
  );

  // Assign target rank first
  if (!currentRoleIds.includes(String(targetRoleId))) {
    await assignGroupRole(membershipId, targetRoleId);
  }

  // Remove only the old ranks managed by this bot
  for (const oldRankId of oldRankIds) {
    await unassignGroupRole(membershipId, oldRankId);
  }

  // Update Discord roles
  const discordMember = await interaction.guild.members.fetch(
    interaction.user.id
  );

  const managedDiscordRoleNames = Object.keys(RANKS).map(
    getDiscordRankName
  );

  const oldDiscordRoles = discordMember.roles.cache.filter(
    role => managedDiscordRoleNames.includes(role.name)
  );

  if (oldDiscordRoles.size > 0) {
    await discordMember.roles.remove(oldDiscordRoles);
  }

  await discordMember.roles.add(targetDiscordRole);

  return interaction.editReply(
    "Rank update successful!\n\n" +
    "Roblox Username: **" + user.name + "**\n" +
    "New Rank: **" + targetDiscordRoleName + "**\n" +
    "Action: **" + action.toUpperCase() + "**\n\n" +
    "Roblox and Discord roles have been updated."
  );
}

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // VERIFY
  if (interaction.commandName === "verify") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const username = interaction.options
        .getString("username")
        .trim();

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
      const pending = pendingVerifications.get(
        interaction.user.id
      );

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
        rolePaths.push(membership.role);
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
        const rankName = getDiscordRankName(matchedRank[0]);

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
        const managedDiscordRoleNames = Object.keys(RANKS).map(
          getDiscordRankName
        );

        const oldRankRoles = member.roles.cache.filter(
          role =>
            managedDiscordRoleNames.includes(role.name) &&
            role.id !== rankRole.id
        );

        if (oldRankRoles.size > 0) {
          await member.roles.remove(oldRankRoles);
        }

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
  }

  // PROMOTE / DEMOTE
  if (
    interaction.commandName === "promote" ||
    interaction.commandName === "demote"
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Owner-only permission
      const actor = await interaction.guild.members.fetch(
        interaction.user.id
      );

      if (!actor.roles.cache.has(DISCORD_OWNER_ROLE_ID)) {
        return interaction.editReply(
          "You are not allowed to use this command. Owner only."
        );
      }

      await changeMemberRank(
        interaction,
        interaction.commandName
      );

    } catch (error) {
      console.error(
        interaction.commandName.toUpperCase() + " ERROR:",
        error
      );

      return interaction.editReply(
        "Rank update failed. Check Railway logs for details. " +
        "If Roblox was already updated, check the member's roles before retrying."
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
