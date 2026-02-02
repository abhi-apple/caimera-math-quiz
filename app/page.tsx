'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type Question = {
  id: string;
  prompt: string;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'intermission';
  serverNow: number;
  winner?: Winner | null;
};

type Winner = {
  questionId: string;
  userId: string;
  userName: string;
};

type LeaderboardItem = {
  userId: string;
  userName: string;
  wins: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function HomePage() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [winner, setWinner] = useState<Winner | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [nameInput, setNameInput] = useState('');

  const expiresIn = useMemo(() => {
    if (!question?.expiresAt) return null;
    return Math.max(0, Math.ceil((question.expiresAt - (now + serverOffset)) / 1000));
  }, [question, now, serverOffset]);

  const isIntermission = question?.status === 'intermission';
  const intermissionTotal = 5;
  const intermissionProgress = useMemo(() => {
    if (!isIntermission || expiresIn === null) return 0;
    return Math.min(100, Math.max(0, ((intermissionTotal - expiresIn) / intermissionTotal) * 100));
  }, [isIntermission, expiresIn]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitial() {
      try {
        const [qRes, lRes] = await Promise.all([
          fetch(`${API_BASE}/question`, { signal: controller.signal }),
          fetch(`${API_BASE}/leaderboard`, { signal: controller.signal })
        ]);
        if (qRes.ok) {
          const data = (await qRes.json()) as Question;
          setQuestion(data);
          if (data.serverNow) {
            setServerOffset(data.serverNow - Date.now());
          }
          setConnected(true);
        }
        if (lRes.ok) {
          const data = await lRes.json();
          setLeaderboard(data.items || []);
        }
      } catch (_err) {
        // Ignore initial fetch errors; SSE will retry
      }
    }

    loadInitial();

    const storedUserId = window.localStorage.getItem('quiz:userId') || '';
    const storedName = window.localStorage.getItem('quiz:userName') || '';
    if (storedUserId) {
      setUserId(storedUserId);
    }
    if (storedName) {
      setUserName(storedName);
      setNameInput(storedName);
      if (storedUserId) {
        registerUser(storedUserId, storedName).catch(() => {});
      }
    }

    const stream = new EventSource(`${API_BASE}/stream`);
    stream.addEventListener('open', () => setConnected(true));
    stream.addEventListener('error', () => setConnected(false));
    stream.addEventListener('question', event => {
      const data = JSON.parse(event.data) as Question;
      setQuestion(data);
      setConnected(true);
      if (data.serverNow) {
        setServerOffset(data.serverNow - Date.now());
      }
      if (data.status === 'active') {
        setWinner(null);
        setStatus('');
        setAnswer('');
      }
    });
    stream.addEventListener('winner', event => {
      const data = JSON.parse(event.data) as Winner;
      setWinner(data);
      setConnected(true);
    });
    stream.addEventListener('leaderboard', event => {
      const data = JSON.parse(event.data) as { items?: LeaderboardItem[] };
      setLeaderboard(data.items || []);
      setConnected(true);
    });
    stream.addEventListener('presence', event => {
      const data = JSON.parse(event.data) as { count: number };
      setActiveCount(data.count);
    });

    return () => {
      controller.abort();
      stream.close();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, []);

  async function registerUser(nextUserId: string, nextName: string) {
    await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: nextUserId, name: nextName })
    });
    window.localStorage.setItem('quiz:userId', nextUserId);
    window.localStorage.setItem('quiz:userName', nextName);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question) return;
    if (question.status === 'intermission') {
      setStatus('Next question is loading. Hold tight.');
      return;
    }
    const trimmedName = userName.trim();
    if (!trimmedName) {
      setStatus('Enter a name first.');
      return;
    }

    setStatus('Submitting...');
    try {
      let currentUserId = userId;
      if (!currentUserId) {
        currentUserId = crypto.randomUUID();
        setUserId(currentUserId);
      }
      await registerUser(currentUserId, trimmedName);
      const res = await fetch(`${API_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          answer,
          userId: currentUserId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Submission failed.');
        return;
      }
      if (data.status === 'incorrect') {
        setStatus('Not quite. Try again.');
      } else if (data.status === 'correct_pending') {
        setStatus('Correct — waiting for winner confirmation...');
      } else if (data.status === 'duplicate') {
        setStatus('Answer already submitted.');
      } else {
        setStatus('Submitted.');
      }
    } catch (err) {
      setStatus('Network issue — retrying is safe.');
    }
  }

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    let currentUserId = userId;
    if (!currentUserId) {
      currentUserId = crypto.randomUUID();
      setUserId(currentUserId);
    }
    await registerUser(currentUserId, trimmed);
    setUserName(trimmed);
    setStatus('');
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="banner">
          Backend is deployed on Render free tier. The instance spins down with inactivity,
          which can delay requests by 50 seconds or more.
        </div>
        <div className="hero-card">
          <div className="pill">
            <span className={`dot ${connected ? 'live' : 'down'}`} />
            {connected ? 'Live' : 'Reconnecting'}
          </div>
          <div className="presence">
            Active users: <strong>{activeCount}</strong>
          </div>
          <h1>Caimera Math Sprint</h1>
          <p>
            First correct answer wins. Questions rotate fast, and the server decides the winner
            to keep things fair across network speeds.
          </p>
        </div>
      </section>

      <section className="game">
        <div className="question-card">
          <div className="question-header">
            <h2>{isIntermission ? 'Intermission' : 'Current Challenge'}</h2>
            {!isIntermission && (
              <span className="timer">
                {expiresIn !== null ? `${expiresIn}s` : '--'}
              </span>
            )}
          </div>
          <div className="question-body">
            <span className="prompt">
              {question?.prompt || 'Waiting for question...'}
            </span>
          </div>
          {isIntermission && (
            <div className="intermission">
              <div className="intermission-winner">
                {winner || question?.winner ? (
                  <>
                    Winner: <strong>{(winner || question?.winner)?.userName}</strong>
                  </>
                ) : (
                  'No winner this round'
                )}
              </div>
              <div
                className="timer-ring"
                style={{ '--progress': `${intermissionProgress}%` } as React.CSSProperties}
              >
                <div className="timer-ring__inner">
                  <span>{expiresIn ?? 0}</span>
                  <small>seconds</small>
                </div>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="answer-form">
            <label>
              Name
              <input
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="your name"
              />
            </label>
            <label>
              Answer
              <input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="type your answer"
                disabled={isIntermission}
              />
            </label>
            <button type="submit" disabled={isIntermission}>
              {isIntermission ? 'Waiting...' : 'Submit'}
            </button>
          </form>
          <p className="status">{status || '\u00A0'}</p>
          {!isIntermission && winner && (
            <div className="winner">
              Winner: <strong>{winner.userName}</strong>
            </div>
          )}
        </div>

        <div className="leaderboard">
          <h3>High Scores</h3>
          <ol>
            {leaderboard.length === 0 && <li>No scores yet.</li>}
            {leaderboard.map(item => (
              <li key={item.userName}>
                <span>{item.userName}</span>
                <span>{item.wins}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      {!userName && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Choose a display name</h3>
            <p>This name will appear on the leaderboard.</p>
            <form onSubmit={handleNameSubmit} className="modal-form">
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="your name"
                autoFocus
              />
              <button type="submit">Continue</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
