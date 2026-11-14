const { ROBLOX_GROUP_ID } = require("./config");

async function robloxRequest(path, options = {}) {
  const apiKey = process.env.ROBLOX_API_KEY;

  if (!apiKey) {
    throw new Error("ROBLOX_API_KEY is missing!");
  }

  const response = await fetch(
    "https://apis.roblox.com/cloud/v2" + path,
    {
      ...options,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        ...options.headers
      }
    }
  );

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      data.message || "Roblox API Error: " + response.status
    );
  }

  return data;
}

async function getRobloxUser(username) {
  const response = await fetch(
    "https://users.roblox.com/v1/usernames/users",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false
      })
    }
  );

  if (!response.ok) {
    throw new Error("Roblox username lookup failed!");
  }

  const data = await response.json();
  return data.data?.[0] || null;
}

async function getRobloxProfile(userId) {
  const response = await fetch(
    "https://users.roblox.com/v1/users/" + userId
  );

  if (!response.ok) {
    throw new Error("Roblox profile lookup failed!");
  }

  return response.json();
}

async function getGroupMember(userId) {
  const filter = encodeURIComponent(
    "user == 'users/" + userId + "'"
  );

  const data = await robloxRequest(
    "/groups/" + ROBLOX_GROUP_ID +
    "/memberships?maxPageSize=10&filter=" + filter
  );

  return data.groupMemberships?.[0] || null;
}

// Assign a Roblox group role
async function assignGroupRole(userId, roleId) {
  return robloxRequest(
    "/groups/" + ROBLOX_GROUP_ID +
    "/memberships/" + userId + ":assignRole",
    {
      method: "POST",
      body: JSON.stringify({
        role: "groups/" + ROBLOX_GROUP_ID +
          "/roles/" + roleId
      })
    }
  );
}

// Remove a specific Roblox group role
async function unassignGroupRole(userId, roleId) {
  return robloxRequest(
    "/groups/" + ROBLOX_GROUP_ID +
    "/memberships/" + userId + ":unassignRole",
    {
      method: "POST",
      body: JSON.stringify({
        role: "groups/" + ROBLOX_GROUP_ID +
          "/roles/" + roleId
      })
    }
  );
}

module.exports = {
  getRobloxUser,
  getRobloxProfile,
  getGroupMember,
  assignGroupRole,
  unassignGroupRole
};
