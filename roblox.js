const { ROBLOX_GROUP_ID } = require("./config");

async function robloxRequest(path, options = {}) {
  const apiKey = process.env.ROBLOX_API_KEY;

  if (!apiKey) {
    throw new Error("ROBLOX_API_KEY is missing!");
  }

  const response = await fetch(
    https://apis.roblox.com/cloud/v2${path},
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
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      data.message || Roblox API Error: ${response.status}
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

async function getGroupMember(userId) {
  const filter = encodeURIComponent(
    user == 'users/${userId}'
  );

  const data = await robloxRequest(
    /groups/${ROBLOX_GROUP_ID}/memberships?maxPageSize=100&filter=${filter}
  );

  return data.groupMemberships?.[0] || null;
}

async function assignRole(membershipId, roleId) {
  return robloxRequest(
    /groups/${ROBLOX_GROUP_ID}/memberships/${membershipId}:assignRole,
    {
      method: "POST",
      body: JSON.stringify({
        roleId: String(roleId)
      })
    }
  );
}

module.exports = {
  getRobloxUser,
  getGroupMember,
  assignRole
};
