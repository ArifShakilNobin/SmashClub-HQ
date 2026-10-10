export interface Player {
  id: string;
  name: string;
  rating: number; // Avg rating point (1-10)
}

export interface Team {
  teamName: string;
  player1: Player;
  player2: Player;
  avgRating: number;
}

export function generateBalancedTeams(players: Player[]): Team[] {
  if (players.length < 2) return [];

  // ১. প্লেয়ারদের রেটিং/পয়েন্ট অনুযায়ী বড় থেকে ছোট সাজানো
  const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);
  const teams: Team[] = [];

  // ২. যদি বিজোড় (Odd) সংখ্যার প্লেয়ার থাকে, তবে শেষ জন বাদ পড়বে বা বাই পাবে
  const pairsCount = Math.floor(sortedPlayers.length / 2);

  // ৩.Snake Draft System: সেরা প্লেয়ারের সাথে তুলনামূলক কম পয়েন্টের প্লেয়ারকে পেয়ার করা
  for (let i = 0; i < pairsCount; i++) {
    const topPlayer = sortedPlayers[i];
    const bottomPlayer = sortedPlayers[sortedPlayers.length - 1 - i];

    const teamAvg = Number(((topPlayer.rating + bottomPlayer.rating) / 2).toFixed(1));

    teams.push({
      teamName: `Team ${i + 1}`,
      player1: topPlayer,
      player2: bottomPlayer,
      avgRating: teamAvg,
    });
  }

  return teams;
}

export function generateRandomTeams(players: Player[]): Team[] {
  if (players.length < 2) return [];

  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const teams: Team[] = [];
  const pairsCount = Math.floor(shuffled.length / 2);

  for (let i = 0; i < pairsCount; i++) {
    const p1 = shuffled[i * 2];
    const p2 = shuffled[i * 2 + 1];
    const teamAvg = Number(((p1.rating + p2.rating) / 2).toFixed(1));

    teams.push({
      teamName: `Team ${i + 1}`,
      player1: p1,
      player2: p2,
      avgRating: teamAvg,
    });
  }

  return teams;
}