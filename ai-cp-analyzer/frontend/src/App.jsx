import { useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

const TIER_CONFIG = {
  beginner: { label: 'BEGINNER', color: 'var(--tier-beginner)', order: 0 },
  intermediate: { label: 'INTERMEDIATE', color: 'var(--tier-intermediate)', order: 1 },
  advanced: { label: 'ADVANCED', color: 'var(--tier-advanced)', order: 2 },
  expert: { label: 'EXPERT', color: 'var(--tier-expert)', order: 3 },
};

function getTier(skillLevel) {
  const key = (skillLevel || '').toLowerCase();
  return TIER_CONFIG[key] || { label: (skillLevel || 'UNKNOWN').toUpperCase(), color: 'var(--tier-beginner)', order: 0 };
}

function ScoreDial({ score }) {
  const clamped = Math.max(0, Math.min(100, score || 0));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="score-dial" role="img" aria-label={`Comprehensive score ${clamped} out of 100`}>
      <svg viewBox="0 0 120 120" width="140" height="140">
        <circle cx="60" cy="60" r="54" className="score-dial-track" />
        <circle
          cx="60"
          cy="60"
          r="54"
          className="score-dial-fill"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-dial-label">
        <span className="score-dial-value">{clamped}</span>
        <span className="score-dial-max">/100</span>
      </div>
    </div>
  );
}

function TagCard({ item, variant }) {
  return (
    <div className={`tag-card tag-card--${variant}`}>
      <div className="tag-card-head">
        <span className={`verdict-chip verdict-chip--${variant}`}>
          {variant === 'ac' ? 'AC' : 'WA'}
        </span>
        <span className="tag-card-topic">{item.topic}</span>
      </div>
      <p className="tag-card-reason">{item.reason}</p>
    </div>
  );
}

export default function App() {
  const [leetcodeUsername, setLeetcodeUsername] = useState('');
  const [codeforcesUsername, setCodeforcesUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [warnings, setWarnings] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const lc = leetcodeUsername.trim();
    const cf = codeforcesUsername.trim();

    if (!lc && !cf) {
      setError('Enter at least one username to run the analysis.');
      return;
    }

    setLoading(true);
    setResult(null);
    setWarnings(null);

    try {
      const { data } = await axios.post(`${API_BASE}/api/analyze`, {
        leetcodeUsername: lc,
        codeforcesUsername: cf,
      });
      setResult(data.analysis);
      setWarnings(data.warnings);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        'Something went wrong while running the analysis.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const tier = result ? getTier(result.skill_level) : null;

  return (
    <div className="page">
      <header className="site-header">
        <div className="logo">
          <span className="logo-bracket">{'<'}</span>
          cp<span className="logo-accent">://</span>analyzer
          <span className="logo-bracket">{'>'}</span>
        </div>
        <p className="tagline">an AI coach that reads your judge history like a compiler reads your code</p>
      </header>

      <main className="container">
        {/* ---------------- Terminal input form ---------------- */}
        <section className="terminal-window" aria-label="Analysis input">
          <div className="terminal-titlebar">
            <span className="dot dot--red" />
            <span className="dot dot--yellow" />
            <span className="dot dot--green" />
            <span className="terminal-title">bash — analyze</span>
          </div>

          <form className="terminal-body" onSubmit={handleSubmit}>
            <div className="prompt-row">
              <span className="prompt-sigil">$</span>
              <span className="prompt-cmd">analyze</span>
              <span className="prompt-flag">--leetcode</span>
              <input
                className="prompt-input"
                type="text"
                placeholder="username"
                value={leetcodeUsername}
                onChange={(e) => setLeetcodeUsername(e.target.value)}
                aria-label="LeetCode username"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
            <div className="prompt-row">
              <span className="prompt-sigil prompt-sigil--ghost">$</span>
              <span className="prompt-flag">--codeforces</span>
              <input
                className="prompt-input"
                type="text"
                placeholder="handle"
                value={codeforcesUsername}
                onChange={(e) => setCodeforcesUsername(e.target.value)}
                aria-label="Codeforces handle"
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            <button className="run-btn" type="submit" disabled={loading}>
              {loading ? (
                <span className="run-btn-loading">
                  <span className="spinner" /> compiling analysis…
                </span>
              ) : (
                <>run analysis <span className="run-btn-key">⏎</span></>
              )}
            </button>
          </form>
        </section>

        {error && (
          <div className="banner banner--error" role="alert">
            <span className="banner-chip">RE</span>
            <span>{error}</span>
          </div>
        )}

        {warnings && (warnings.leetcode_not_found || warnings.codeforces_not_found) && (
          <div className="banner banner--warn" role="status">
            <span className="banner-chip">WA</span>
            <span>
              {warnings.leetcode_not_found && 'LeetCode username not found. '}
              {warnings.codeforces_not_found && 'Codeforces handle not found. '}
              Continuing with the data that was available.
            </span>
          </div>
        )}

        {/* ---------------- Results dashboard ---------------- */}
        {result && (
          <section className="results" aria-label="Analysis results">
            <div className="verdict-banner" style={{ '--tier-color': tier.color }}>
              <div className="verdict-banner-left">
                <span className="verdict-label">VERDICT</span>
                <span className="verdict-tier">{tier.label}</span>
              </div>
              <ScoreDial score={result.comprehensive_score} />
              <div className="verdict-banner-right">
                <span className="stat-value">{result.total_solved_combined}</span>
                <span className="stat-label">problems solved (combined)</span>
              </div>
            </div>

            <div className="grid-2col">
              <div className="panel">
                <h2 className="panel-title panel-title--ac">
                  <span className="verdict-chip verdict-chip--ac">AC</span> Strengths
                </h2>
                <div className="tag-list">
                  {(result.strengths || []).map((s, i) => (
                    <TagCard key={i} item={s} variant="ac" />
                  ))}
                  {(!result.strengths || result.strengths.length === 0) && (
                    <p className="empty-note">No strengths reported.</p>
                  )}
                </div>
              </div>

              <div className="panel">
                <h2 className="panel-title panel-title--wa">
                  <span className="verdict-chip verdict-chip--wa">WA</span> Weaknesses
                </h2>
                <div className="tag-list">
                  {(result.weaknesses || []).map((w, i) => (
                    <TagCard key={i} item={w} variant="wa" />
                  ))}
                  {(!result.weaknesses || result.weaknesses.length === 0) && (
                    <p className="empty-note">No weaknesses reported.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="panel">
              <h2 className="panel-title">
                <span className="panel-title-mono">// roadmap</span> Recommended problem set
              </h2>
              <ol className="roadmap-list">
                {(result.roadmap_recommendations || []).map((step, i) => (
                  <li key={i} className="roadmap-item">
                    <span className="roadmap-index">{String(i + 1).padStart(2, '0')}</span>
                    <span className="roadmap-text">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="panel panel--summary">
              <h2 className="panel-title">
                <span className="panel-title-mono">// coach notes</span>
              </h2>
              <p className="coach-summary">{result.coach_summary}</p>
            </div>
          </section>
        )}

        {!result && !loading && (
          <div className="empty-state">
            <p>
              Enter a LeetCode username, a Codeforces handle, or both — then run the
              analysis to get your score, strengths, weaknesses, and a roadmap.
            </p>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <span>Data pulled live from LeetCode &amp; Codeforces · Scored by Gemini AI</span>
      </footer>
    </div>
  );
}
