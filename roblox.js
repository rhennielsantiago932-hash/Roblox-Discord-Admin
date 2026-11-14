const GROUP_ID = require("./config").ROBLOX_GROUP_ID;

async function robloxRequest(path, options = {}) {
  const response = await fetch(
    `https://apis.roblox.com/cloud/v2${path}`,
    {
      ...options,
      headers: {
        "x-api-key": process.env.ROBLOX_API_KEY,
        "Content-Type": "application/json",
        ...options.headers
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Roblox API error");
  }

  return data;
}

async function getRobloxUser(username) {
  const response = await fetch(
    "https://users.roblox.com/v1/usernames/users",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false
      })
    }
  );

  if (!response.ok) throw new Error("Username lookup failed");

  const data = await response.json();
  return data.data[0] || null;
}

async function getGroupMember(userId) {
  const data = await robloxRequest(
    `/groups/${GROUP_ID}/memberships?maxPageSize=100&filter=userId%20%3D%3D%20${userId}`
  );

  return data.groupMemberships?.[0] || null;
}

async function assignRole(membershipId, roleId) {
  return robloxRequest(
    `/groups/${GROUP_ID}/memberships/${membershipId}:assignRole`,
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
