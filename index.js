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
  DISCORD_CLIENT_ID,
  DISCORD_OWNER_ROLE_ID,
  RANKS
} = require("./config");

const {
  getRobloxUser,
  getGroupMember,
  assignGroupRole,
  unassignGroupRole
} = require("./roblox");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const rankChoices = [
  { name: "Owner", value: "OWNER" },
  { name: "Developer", value: "DEVELOPER" },
  { name: "Admin", value: "ADMIN" },
  { name: "Staff Team", value: "STAFF_TEAM" },
  { name: "Vendor", value: "VENDOR" }
];

function getDiscordRankName(rankName) {
  return rankName
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// VERIFY
const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Verify your Roblox username and group membership")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Your Roblox username")
      .setRequired(true)
  );

// PROMOTE
const promoteCommand = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Promote a Roblox group member")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Roblox username")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("rank")
      .setDescription("Choose target rank")
      .setRequired(true)
      .addChoices(...rankChoices)
  );

// DEMOTE
const demoteCommand = new SlashCommandBuilder()
  .setName("demote")
  .setDescription("Demote a Roblox group member")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Roblox username")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("rank")
      .setDescription("Choose target rank")
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

// VERIFY MEMBER
async function verifyMember(interaction) {
  const username = interaction.options
    .getString("username")
    .trim();

  const user = await getRobloxUser(username);

  if (!user) {
    return interaction.editReply(
      "Roblox account not found. Check your username."
    );
  }

  const membership = await getGroupMember(user.id);

  if (!membership) {
    return interaction.editReply(
      "You are not a member of our Roblox group. Join first!"
    );
  }

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

  const verifiedRole = interaction.guild.roles.cache.find(
    role => role.name === "Verified"
  );

  if (!verifiedRole) {
    return interaction.editReply(
      "Discord Verified role was not found."
    );
  }

  const member = await interaction.guild.members.fetch(
    interaction.user.id
  );

  await member.roles.add(verifiedRole);

  let rankMessage = "";

  if (matchedRank) {
    const rankName = getDiscordRankName(matchedRank[0]);

    const rankRole = interaction.guild.roles.cache.find(
      role => role.name === rankName
    );

    if (!rankRole) {
      return interaction.editReply(
        "Discord rank role not found: " + rankName
      );
    }

    const managedNames = Object.keys(RANKS).map(
      getDiscordRankName
    );

    const oldRoles = member.roles.cache.filter(
      role =>
        managedNames.includes(role.name) &&
        role.id !== rankRole.id
    );

    if (oldRoles.size > 0) {
      await member.roles.remove(oldRoles);
    }

    await member.roles.add(rankRole);
    rankMessage = "\nRank: *" + rankName + "*";
  }

  return interaction.editReply(
    "Verification successful!\n" +
    "Roblox Username: **" + user.name + "**\n" +
    "Discord Role: *Verified*" +
    rankMessage
  );
}

// CHANGE RANK
async function changeMemberRank(interaction, action) {
  const username = interaction.options
    .getString("username")
    .trim();

  const targetRank = interaction.options.getString("rank");
  const targetRoleId = RANKS[targetRank];

  if (!targetRoleId) {
    return interaction.editReply("Invalid target rank.");
  }

  const targetDiscordRoleName = getDiscordRankName(targetRank);

  const targetDiscordRole = interaction.guild.roles.cache.find(
    role => role.name === targetDiscordRoleName
  );

  if (!targetDiscordRole) {
    return interaction.editReply(
      "Discord rank role not found: " + targetDiscordRoleName
    );
  }

  const user = await getRobloxUser(username);

  if (!user) {
    return interaction.editReply(
      "Roblox account not found."
    );
  }

  const membership = await getGroupMember(user.id);

  if (!membership) {
    return interaction.editReply(
      "That Roblox user is not a member of our group."
    );
  }

  if (!membership.user) {
    return interaction.editReply(
      "Could not read Roblox membership information."
    );
  }

  const membershipId = membership.user.split("/").pop();

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

  if (!currentRoleIds.includes(String(targetRoleId))) {
    await assignGroupRole(membershipId, targetRoleId);
  }

  for (const oldRankId of oldRankIds) {
    await unassignGroupRole(membershipId, oldRankId);
  }

  const discordMember = await interaction.guild.members.fetch(
    interaction.user.id
  );

  const managedNames = Object.keys(RANKS).map(
    getDiscordRankName
  );

  const oldDiscordRoles = discordMember.roles.cache.filter(
    role => managedNames.includes(role.name)
  );

  if (oldDiscordRoles.size > 0) {
    await discordMember.roles.remove(oldDiscordRoles);
  }

  await discordMember.roles.add(targetDiscordRole);

  return interaction.editReply(
    "Rank update successful!\n\n" +
    "Roblox Username: **" + user.name + "**\n" +
    "New Rank: **" + targetDiscordRoleName + "**\n" +
    "Action: *" + action.toUpperCase() + "*"
  );
}

// INTERACTIONS
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (
    !["verify", "promote", "demote"].includes(
      interaction.commandName
    )
  ) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (interaction.commandName === "verify") {
      return await verifyMember(interaction);
    }

    const actor = await interaction.guild.members.fetch(
      interaction.user.id
    );

    if (!actor.roles.cache.has(DISCORD_OWNER_ROLE_ID)) {
      return interaction.editReply(
        "You are not allowed to use this command. Owner only."
      );
    }

    return await changeMemberRank(
      interaction,
      interaction.commandName
    );

  } catch (error) {
    console.error(
      interaction.commandName.toUpperCase() + " ERROR:",
      error
    );

    return interaction.editReply(
      "An error occurred. Please check Railway logs."
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
