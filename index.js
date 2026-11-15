require("dotenv").config();

const http = require("node:http");
const crypto = require("node:crypto");
const { initializeDatabase, pool } = require("./database");

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

// VERIFY COMMAND
const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Check your Roblox group membership")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Your Roblox username")
      .setRequired(true)
  );

// PROMOTE COMMAND
const promoteCommand = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Promote a Roblox group member")
  .addUserOption(option =>
    option
      .setName("member")
      .setDescription("Discord member to promote")
      .setRequired(true)
  )
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

// DEMOTE COMMAND
const demoteCommand = new SlashCommandBuilder()
  .setName("demote")
  .setDescription("Demote a Roblox group member")
  .addUserOption(option =>
    option
      .setName("member")
      .setDescription("Discord member to demote")
      .setRequired(true)
  )
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

// REGISTER COMMANDS
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
    console.error(error);
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
      "Roblox account not found. Check the username."
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
    rankMessage = "\nRank: " + rankName + "";
  }

  return interaction.editReply(
    "Verification successful!\n" +
    "Roblox Username: **" + user.name + "**\n" +
    "Discord Role: Verified" +
    rankMessage
  );
}

// CHANGE MEMBER RANK
async function changeMemberRank(interaction, action) {
  const targetDiscordUser = interaction.options.getUser("member");
  const username = interaction.options
    .getString("username")
    .trim();

  const targetRank = interaction.options.getString("rank");
  const targetRoleId = RANKS[targetRank];

  if (!targetRoleId) {
    return interaction.editReply("Invalid target rank.");
  }

  const targetMember = await interaction.guild.members.fetch(
    targetDiscordUser.id
  );

  const verifiedRole = interaction.guild.roles.cache.find(
    role => role.name === "Verified"
  );

  if (!verifiedRole || !targetMember.roles.cache.has(verifiedRole.id)) {
    return interaction.editReply(
      "The selected Discord member must have the Verified role first."
    );
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

  const managedDiscordNames = Object.keys(RANKS).map(
    getDiscordRankName
  );

  const oldDiscordRoles = targetMember.roles.cache.filter(
    role =>
      managedDiscordNames.includes(role.name) &&
      role.id !== targetDiscordRole.id
  );

  if (oldDiscordRoles.size > 0) {
    await targetMember.roles.remove(oldDiscordRoles);
  }

  await targetMember.roles.add(targetDiscordRole);

  return interaction.editReply(
    "Rank update successful!\n\n" +
    "Discord Member: **" + targetDiscordUser.tag + "**\n" +
    "Roblox Username: **" + user.name + "**\n" +
    "New Rank: **" + targetDiscordRoleName + "**\n" +
    "Action: " + action.toUpperCase() + ""
  );
}

// INTERACTION HANDLER
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (
    !["verify", "promote", "demote"].includes(
      interaction.commandName
    )
  ) {
    return;
  }

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
      "Rank operation failed. Please check Railway logs."
    );
  }
});

// SECURE GAME CONNECTION
function checkGameSecret(received, expected) {
  if (typeof received !== "string" || !expected) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}

// HTTP SERVER
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "online",
      service: "Roblox Discord Ranking Bot"
    }));
  }

  if (req.method === "GET" && req.url === "/game-test") {
    const received = req.headers["x-game-secret"];

    if (!checkGameSecret(
      received,
      process.env.GAME_API_SECRET
    )) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        error: "Unauthorized"
      }));
    }

    res.writeHead(200);
    return res.end(JSON.stringify({
      authenticated: true,
      message: "Roblox connection successful!"
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({
    error: "Not Found"
  }));
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("GAME API SERVER ONLINE!");
});

initializeDatabase()
  .then(() => {
    return client.login(process.env.DISCORD_TOKEN);
  })
  .catch(error => {
    console.error("DATABASE CONNECTION FAILED:", error);
  });
