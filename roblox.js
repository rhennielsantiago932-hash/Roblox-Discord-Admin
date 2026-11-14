const GROUP_ID = process.env.ROBLOX_GROUP_ID;

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
    throw new Error("Roblox API error");
  }

  const data = await response.json();

  return data.data[0] || null;
}

async function getGroupMember(userId) {
  const response = await fetch(
    https://groups.roblox.com/v2/users/${userId}/groups/roles
  );

  if (!response.ok) {
    throw new Error("Unable to check group membership");
  }

  const data = await response.json();

  return data.data.find(
    group => String(group.group.id) === String(GROUP_ID)
  ) || null;
}

module.exports = {
  getRobloxUser,
  getGroupMember
};
