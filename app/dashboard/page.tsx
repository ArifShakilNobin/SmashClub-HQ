'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { generateBalancedTeams, generateRandomTeams, Player, Team } from '@/lib/teamBalancer';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'manager' | 'player'>('player');
  const [activeTab, setActiveTab] = useState<'match' | 'vote' | 'teams' | 'logs' | 'users'>('match');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dashboard Data States
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  
  // RSVP & Voting States
  const [rsvps, setRsvps] = useState<any[]>([]);
  const [myRsvpStatus, setMyRsvpStatus] = useState<'in' | 'out' | null>(null);
  const [playerRatings, setPlayerRatings] = useState<any[]>([]);
  const [givenVotes, setGivenVotes] = useState<{ [key: string]: number }>({});

  // Manager New Match Form States
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        router.push('/');
      } else {
        setUser(session.user);
        fetchUserProfile(session.user.id);
        fetchLatestMatch();
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        router.push('/');
      } else {
        setUser(session.user);
        fetchUserProfile(session.user.id);
        fetchLatestMatch();
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [router]);

  const fetchUserProfile = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (profile) {
      const role = profile.role || 'player';
      setUserRole(role);
    }
    fetchAllProfiles();
  };

  const fetchAllProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setAllProfiles(data);
  };

  const fetchLatestMatch = async () => {
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (matches && matches.length > 0) {
      const match = matches[0];
      setCurrentMatch(match);
      fetchTeams(match.id);
      fetchPlayerRatings(match.id);
      fetchRsvps(match.id);
    } else {
      setCurrentMatch(null);
      setTeams([]);
      setPlayerRatings([]);
      setGivenVotes({});
      setRsvps([]);
      setMyRsvpStatus(null);
    }
  };

  const fetchRsvps = async (matchId: string) => {
    const { data } = await supabase.from('match_rsvps').select('*').eq('match_id', matchId);
    if (data) {
      setRsvps(data);
      if (user) {
        const userRsvp = data.find((r) => r.player_id === user.id);
        setMyRsvpStatus(userRsvp ? userRsvp.status : null);
      }
    }
  };

  const fetchTeams = async (matchId: string) => {
    const { data } = await supabase.from('teams').select('*').eq('match_id', matchId);
    if (data) setTeams(data);
  };

  const fetchPlayerRatings = async (matchId: string) => {
    const { data } = await supabase
      .from('player_ratings')
      .select('*, voter:profiles!voter_id(full_name), target:profiles!target_player_id(full_name)')
      .eq('match_id', matchId);

    if (data) {
      setPlayerRatings(data);
      if (user) {
        const myGiven: { [key: string]: number } = {};
        data.forEach((r) => {
          if (r.voter_id === user.id) {
            myGiven[r.target_player_id] = Number(r.rating);
          }
        });
        setGivenVotes(myGiven);
      }
    }
  };

  const handleRsvp = async (status: 'in' | 'out') => {
    if (!user || !currentMatch) return;

    const { error } = await supabase
      .from('match_rsvps')
      .upsert({
        match_id: currentMatch.id,
        player_id: user.id,
        status: status,
      }, { onConflict: 'match_id,player_id' });

    if (!error) {
      setMyRsvpStatus(status);
      if (status === 'out') {
        await supabase.from('player_ratings').delete().eq('match_id', currentMatch.id).eq('voter_id', user.id);
      }
      fetchRsvps(currentMatch.id);
      fetchPlayerRatings(currentMatch.id);
      alert(`You are marked as ${status.toUpperCase()} for this match!`);
    } else {
      alert('RSVP error: ' + error.message);
    }
  };

  const handleVotePlayer = async (targetPlayerId: string, ratingValue: number) => {
    if (!user || !currentMatch) return;
    if (myRsvpStatus !== 'in') {
      alert('You must be marked as "IN" for this match to vote!');
      return;
    }

    const { error } = await supabase.from('player_ratings').insert([
      {
        match_id: currentMatch.id,
        voter_id: user.id,
        target_player_id: targetPlayerId,
        rating: ratingValue,
      },
    ]);

    if (!error) {
      alert('Vote successfully submitted!');
      fetchPlayerRatings(currentMatch.id);
    } else {
      alert('Error: You can only vote once per player for each match, or the target player is not marked as "IN".');
    }
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocation || !newDate || !newTime) return;

    setIsPublishing(true);
    const { data, error } = await supabase
      .from('matches')
      .insert([{ location: newLocation, match_date: newDate, match_time: newTime, status: 'open' }])
      .select()
      .single();

    if (!error && data) {
      setShowAddMatch(false);
      setNewLocation('');
      setNewDate('');
      setNewTime('');
      fetchLatestMatch();

      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: data }),
        });
        alert('Match Slot Published & Email Notifications Sent!');
      } catch (err) {
        alert('Match Slot Published, but failed to send emails.');
      }
    } else {
      alert('Match create error: ' + error?.message);
    }
    setIsPublishing(false);
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!window.confirm('Delete this match slot?')) return;
    const { error } = await supabase.from('matches').delete().eq('id', matchId);
    if (!error) {
      alert('Match slot deleted!');
      fetchLatestMatch();
    } else {
      alert('Delete error: ' + error.message);
    }
  };

  const handleRemovePlayer = async (targetUserId: string, targetName: string) => {
    if (targetUserId === user?.id) return;
    if (!window.confirm(`Remove ${targetName || 'player'} from system?`)) return;

    const { error } = await supabase.from('profiles').delete().eq('id', targetUserId);
    if (!error) {
      alert('Player removed successfully!');
      fetchAllProfiles();
      if (currentMatch) {
        fetchRsvps(currentMatch.id);
        fetchPlayerRatings(currentMatch.id);
      }
    } else {
      alert('Error: ' + error.message);
    }
  };

  const handleToggleRole = async (targetUserId: string, currentRole: string) => {
    const newRole = currentRole === 'manager' ? 'player' : 'manager';
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', targetUserId);
    if (!error) {
      fetchAllProfiles();
      if (targetUserId === user?.id) setUserRole(newRole as 'manager' | 'player');
    }
  };

  const getPlayerAverageScore = (targetId: string) => {
    const inVoterIds = rsvps.filter((r) => r.status === 'in').map((r) => r.player_id);
    const validRatings = playerRatings.filter((r) => r.target_player_id === targetId && inVoterIds.includes(r.voter_id));
    if (validRatings.length === 0) return 'No Valid Votes';
    const total = validRatings.reduce((acc, curr) => acc + Number(curr.rating), 0);
    return (total / validRatings.length).toFixed(1) + ' / 10 (' + validRatings.length + ' votes)';
  };

  const handleGenerateTeams = async (type: 'balanced' | 'random') => {
    if (!currentMatch) return;
    const inPlayerIds = rsvps.filter((r) => r.status === 'in').map((r) => r.player_id);

    const playersToBalance: Player[] = allProfiles
      .filter((p) => inPlayerIds.includes(p.id))
      .map((p) => {
        const avgScoreStr = getPlayerAverageScore(p.id);
        const avg = avgScoreStr.includes('/') ? parseFloat(avgScoreStr.split(' / ')[0]) : 5;
        return { id: p.id, name: p.full_name || p.email || 'Player', rating: Number(avg.toFixed(1)) };
      });

    if (playersToBalance.length < 2) {
      alert('Team banate atoto 2 jon "IN" thaka player lagbe!');
      return;
    }

    const generated = type === 'balanced' 
      ? generateBalancedTeams(playersToBalance) 
      : generateRandomTeams(playersToBalance);

    await supabase.from('teams').delete().eq('match_id', currentMatch.id);

    const teamInserts = generated.map((t: Team) => ({
      match_id: currentMatch.id,
      team_name: t.teamName,
      player1_id: t.player1.id,
      player2_id: t.player2.id,
      avg_rating: t.avgRating,
    }));

    const { error } = await supabase.from('teams').insert(teamInserts);

    if (!error) {
      alert('Team successfully generated!');
      fetchTeams(currentMatch.id);
      setActiveTab('teams');
    } else {
      alert('Team insert error: ' + error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (!user) return null;

  const inPlayerProfiles = allProfiles.filter((p) => rsvps.some((r) => r.player_id === p.id && r.status === 'in'));

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row pb-20 md:pb-0">
      {/* OVERLAY FOR MOBILE SIDEBAR */}
      {isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden" />
      )}

      {/* DESKTOP SIDEBAR & MOBILE DRAWER */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div>
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏸</span>
              <div>
                <h1 className="text-lg font-black tracking-tight text-emerald-400">SmashClub HQ</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Match Manager</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white p-2">✕</button>
          </div>

          <nav className="p-4 space-y-1.5">
            <button onClick={() => { setActiveTab('match'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${activeTab === 'match' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>📅 Match Slot & RSVP</button>
            {userRole === 'player' && (
              <button onClick={() => { setActiveTab('vote'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${activeTab === 'vote' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>⭐ Vote Players</button>
            )}
            <button onClick={() => { setActiveTab('teams'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${activeTab === 'teams' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>🏆 Team Lineup</button>

            {userRole === 'manager' && (
              <>
                <div className="pt-5 pb-2 px-4 text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Manager Control</div>
                <button onClick={() => { setActiveTab('logs'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${activeTab === 'logs' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>📊 Vote Logs & Averages</button>
                <button onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${activeTab === 'users' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>👥 User Management</button>
              </>
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="overflow-hidden">
            <p className="text-xs font-bold truncate text-slate-200">{user.user_metadata?.full_name || user.email}</p>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${userRole === 'manager' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}`}>{userRole}</span>
          </div>
          <button onClick={handleSignOut} className="text-xs font-bold text-red-400 hover:text-red-300 p-2">Logout</button>
        </div>
      </aside>

      {/* MOBILE TOP NAVBAR */}
      <header className="md:hidden sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏸</span>
          <span className="text-sm font-black text-emerald-400">SmashClub HQ</span>
        </div>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-300 bg-slate-800 rounded-lg text-xs font-bold border border-slate-700">
          ☰ Menu
        </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
          {/* TAB 1: MATCH SLOT & RSVP */}
          {activeTab === 'match' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg sm:text-2xl font-black text-slate-100">Active Match Slot</h2>
                  <p className="text-xs text-slate-400">View upcoming badminton slot and RSVP attendance.</p>
                </div>
                {userRole === 'manager' && (
                  <button onClick={() => setShowAddMatch(!showAddMatch)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-3 rounded-xl transition shadow-lg shadow-amber-500/10 w-full sm:w-auto">
                    {showAddMatch ? '✕ Close Form' : '➕ Create New Match Slot'}
                  </button>
                )}
              </div>

              {/* MANAGER CREATE MATCH FORM */}
              {userRole === 'manager' && showAddMatch && (
                <form onSubmit={handleCreateMatch} className="bg-slate-900 border border-amber-500/30 p-5 sm:p-6 rounded-2xl mb-6 space-y-4 shadow-2xl">
                  <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest">Publish New Match Slot</h3>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-bold">Location</label>
                    <input type="text" placeholder="e.g. Uttara Indoor Badminton Court" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 text-xs rounded-xl text-white focus:outline-none focus:border-amber-500" required />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-bold">Date</label>
                      <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 text-xs rounded-xl text-white focus:outline-none focus:border-amber-500" required />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-bold">Time Slot</label>
                      <input type="text" placeholder="e.g. 8:00 PM - 10:00 PM" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 text-xs rounded-xl text-white focus:outline-none focus:border-amber-500" required />
                    </div>
                  </div>
                  <button type="submit" disabled={isPublishing} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-xs transition">
                    {isPublishing ? 'Publishing & Sending Emails...' : '📢 Publish & Broadcast to All Users'}
                  </button>
                </form>
              )}

              {currentMatch ? (
                <div className="space-y-6">
                  <section className="bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-800 relative shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">Active Match</span>
                        <h3 className="text-xl sm:text-3xl font-black mt-3 text-slate-100">{currentMatch.location}</h3>
                        <p className="text-slate-300 mt-2 text-xs sm:text-sm font-medium">📅 Date: <span className="text-white font-bold">{currentMatch.match_date}</span> | ⏰ Time: <span className="text-white font-bold">{currentMatch.match_time}</span></p>
                      </div>

                      {userRole === 'manager' && (
                        <div className="flex flex-wrap sm:flex-col gap-2 items-start sm:items-end border-t sm:border-0 border-slate-800 pt-3 sm:pt-0">
                          <button onClick={() => handleDeleteMatch(currentMatch.id)} className="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white text-xs px-3 py-1.5 rounded-lg font-bold transition">🗑️ Delete</button>
                          <div className="flex gap-2">
                            <button onClick={() => handleGenerateTeams('balanced')} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3 py-1.5 rounded-lg text-xs transition shadow-md">⚡ Balance</button>
                            <button onClick={() => handleGenerateTeams('random')} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition">🎲 Random</button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 border-t border-slate-800 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <p className="text-xs sm:text-sm font-bold text-slate-200">Will you play in this match?</p>
                      <div className="grid grid-cols-2 gap-3 sm:flex">
                        <button onClick={() => handleRsvp('in')} className={`py-3 px-6 rounded-xl text-xs font-black transition ${myRsvpStatus === 'in' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>✓ I AM IN</button>
                        <button onClick={() => handleRsvp('out')} className={`py-3 px-6 rounded-xl text-xs font-black transition ${myRsvpStatus === 'out' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>✕ I AM OUT</button>
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-xl">
                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4">👥 Joined Players ({inPlayerProfiles.length})</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {inPlayerProfiles.map((p) => (
                        <div key={p.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center gap-3">
                          <span className="text-base">🏸</span>
                          <span className="text-xs font-bold truncate text-slate-200">{p.full_name || p.email || 'Player'}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="bg-slate-900 p-8 rounded-2xl text-center text-slate-400 border border-slate-800">
                  <p className="text-sm mb-2 font-medium">No active match slot available.</p>
                  {userRole === 'manager' && <p className="text-xs text-amber-400 font-bold">Click &quot;Create New Match Slot&quot; above to publish a new slot!</p>}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VOTE */}
          {activeTab === 'vote' && userRole === 'player' && (
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-slate-100 mb-1">⭐ Vote Other Players</h2>
              <p className="text-xs text-slate-400 mb-6">Rate peer skills (1-10) to auto-balance match teams fairly.</p>

              {myRsvpStatus !== 'in' ? (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-amber-400 text-xs font-semibold">⚠️ You must set your status to <strong>&quot;IN&quot;</strong> on the Match Slot tab before submitting votes.</div>
              ) : (
                <div className="grid gap-4">
                  {inPlayerProfiles.filter((p) => p.id !== user?.id).map((target) => {
                    const hasVoted = givenVotes[target.id] !== undefined;
                    return (
                      <div key={target.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-800 gap-3">
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-slate-200">{target.full_name || target.email || 'Player'}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Average Score: {getPlayerAverageScore(target.id)}</p>
                        </div>
                        {hasVoted ? (
                          <span className="self-start sm:self-auto text-[11px] bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl font-bold border border-emerald-500/20">✓ Voted: {givenVotes[target.id]} / 10</span>
                        ) : (
                          <div className="flex gap-2 items-center self-start sm:self-auto">
                            <select id={`select-${target.id}`} defaultValue="5" className="bg-slate-950 border border-slate-800 text-xs rounded-xl p-2.5 text-amber-400 focus:outline-none focus:border-emerald-500 font-bold">
                              {[1,2,3,4,5,6,7,8,9,10].map((num) => <option key={num} value={num}>{num}/10</option>)}
                            </select>
                            <button onClick={() => {
                              const val = Number((document.getElementById(`select-${target.id}`) as HTMLSelectElement).value);
                              handleVotePlayer(target.id, val);
                            }} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition">Submit</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEAMS LINEUP */}
          {activeTab === 'teams' && (
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-slate-100 mb-1">🏆 Team Lineup</h2>
              <p className="text-xs text-slate-400 mb-6">Generated doubles teams for the current match.</p>

              {teams.length === 0 ? (
                <div className="bg-slate-900 p-8 rounded-2xl text-center text-slate-400 border border-slate-800">
                  No teams generated yet. Managers can balance teams from the Match Slot controls.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {teams.map((team, idx) => {
                    const p1 = allProfiles.find((p) => p.id === team.player1_id);
                    const p2 = allProfiles.find((p) => p.id === team.player2_id);

                    return (
                      <div key={team.id || idx} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs text-emerald-400 font-black uppercase tracking-wider">{team.team_name}</span>
                          {team.avg_rating && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 font-bold">
                              Avg: {team.avg_rating} / 10
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs font-bold text-slate-200">
                            👤 {p1?.full_name || p1?.email || 'Player 1'}
                          </div>
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs font-bold text-slate-200">
                            👤 {p2?.full_name || p2?.email || 'Player 2'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VOTE LOGS */}
          {activeTab === 'logs' && userRole === 'manager' && (
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-amber-400 mb-1">📊 Vote Logs & Averages</h2>
              <p className="text-xs text-slate-400 mb-6">Peer rating breakdown for all active joined players.</p>
              <div className="bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-3">
                {inPlayerProfiles.map((p) => (
                  <div key={p.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">{p.full_name || p.email}</span>
                    <span className="text-amber-400 font-extrabold bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">{getPlayerAverageScore(p.id)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: USER MANAGEMENT */}
          {activeTab === 'users' && userRole === 'manager' && (
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-amber-400 mb-1">👥 User Role Management</h2>
              <p className="text-xs text-slate-400 mb-6">Promote users to manager or remove inactive accounts.</p>
              <div className="bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-3">
                {allProfiles.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 gap-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-200">{p.full_name || p.email}</span>
                      <span className={`ml-2 text-[9px] uppercase font-black px-2 py-0.5 rounded ${p.role === 'manager' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>{p.role}</span>
                    </div>
                    <div className="flex gap-2 self-end sm:self-auto">
                      <button onClick={() => handleToggleRole(p.id, p.role)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg font-bold transition">Toggle Role</button>
                      {p.id !== user?.id && (
                        <button onClick={() => handleRemovePlayer(p.id, p.full_name)} className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1.5 rounded-lg font-bold transition">Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 px-2 py-2 flex justify-around items-center">
        <button onClick={() => setActiveTab('match')} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${activeTab === 'match' ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
          <span className="text-base">📅</span>
          <span className="text-[10px]">Slot</span>
        </button>
        {userRole === 'player' && (
          <button onClick={() => setActiveTab('vote')} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${activeTab === 'vote' ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
            <span className="text-base">⭐</span>
            <span className="text-[10px]">Vote</span>
          </button>
        )}
        <button onClick={() => setActiveTab('teams')} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${activeTab === 'teams' ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
          <span className="text-base">🏆</span>
          <span className="text-[10px]">Teams</span>
        </button>
        {userRole === 'manager' && (
          <>
            <button onClick={() => setActiveTab('logs')} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${activeTab === 'logs' ? 'text-amber-400 font-black' : 'text-slate-400'}`}>
              <span className="text-base">📊</span>
              <span className="text-[10px]">Logs</span>
            </button>
            <button onClick={() => setActiveTab('users')} className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${activeTab === 'users' ? 'text-amber-400 font-black' : 'text-slate-400'}`}>
              <span className="text-base">👥</span>
              <span className="text-[10px]">Users</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}