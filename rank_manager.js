const { RANKS } = require("./config");

function getRank(rankName) {
  const rank = RANKS[rankName.toUpperCase()];

  if (!rank || rank === 0) {
    throw new Error("Rank not configured: " + rankName);
  }

  return rank;
}

function getAvailableRanks() {
  return Object.entries(RANKS)
    .filter(([name, id]) => id !== 0)
    .map(([name, id]) => ({
      name,
      id
    }));
}

module.exports = {
  getRank,
  getAvailableRanks
};
