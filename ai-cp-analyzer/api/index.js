// =====================================================================
// AI-Powered Competitive Programming Analyzer — Backend (Groq Edition)
// Express app, exported directly for Vercel's @vercel/node runtime.
// =====================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const Groq = require('groq-sdk'); // استدعاء مكتبة Groq الجديدة

const app = express();
app.use(cors());
app.use(express.json());

// تعريف عميل Groq باستخدام المفتاح من ملف .env
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---------------------------------------------------------------------
// Postgres (Neon) connection pool
// ---------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  console.warn('[WARN] DATABASE_URL is not set. Database operations will fail.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3, // keep low - serverless functions should not hog connections
  idleTimeoutMillis: 10000,
});

// ---------------------------------------------------------------------
// Helpers: input validation
// ---------------------------------------------------------------------
const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,40}$/;

function isValidUsername(u) {
  return typeof u === 'string' && u.trim().length > 0 && USERNAME_RE.test(u.trim());
}

// ---------------------------------------------------------------------
// LeetCode: GraphQL API (public, unauthenticated)
// ---------------------------------------------------------------------
async function fetchLeetCodeData(username) {
  const query = `
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          ranking
          reputation
        }
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
          totalSubmissionNum {
            difficulty
            count
          }
        }
        tagProblemCounts {
          advanced { tagName problemsSolved }
          intermediate { tagName problemsSolved }
          fundamental { tagName problemsSolved }
        }
      }
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        topPercentage
      }
    }
  `;

  const response = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://leetcode.com',
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode API responded with status ${response.status}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`LeetCode API error: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  if (!json.data || !json.data.matchedUser) {
    return null;
  }

  return {
    username,
    profile: json.data.matchedUser.profile,
    submitStats: json.data.matchedUser.submitStatsGlobal,
    tagProblemCounts: json.data.matchedUser.tagProblemCounts,
    contestRanking: json.data.userContestRanking || null,
  };
}

// ---------------------------------------------------------------------
// Codeforces: REST API (public, unauthenticated)
// ---------------------------------------------------------------------
async function fetchCodeforcesData(username) {
  const infoRes = await fetch(
    `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`
  );
  const infoJson = await infoRes.json();

  if (infoJson.status !== 'OK') {
    return null;
  }

  const userInfo = infoJson.result[0];

  const statusRes = await fetch(
    `https://codeforces.com/api/user.status?handle=${encodeURIComponent(username)}&from=1&count=10000`
  );
  const statusJson = await statusRes.json();

  let solvedProblems = new Map(); 
  let totalSubmissions = 0;

  if (statusJson.status === 'OK') {
    totalSubmissions = statusJson.result.length;
    for (const sub of statusJson.result) {
      if (sub.verdict === 'OK') {
        const pid = `${sub.problem.contestId || ''}-${sub.problem.index || sub.problem.name}`;
        if (!solvedProblems.has(pid)) {
          solvedProblems.set(pid, {
            rating: sub.problem.rating || null,
            tags: sub.problem.tags || [],
          });
        }
      }
    }
  }

  const tagCounts = {};
  for (const { tags } of solvedProblems.values()) {
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const solvedRatings = [...solvedProblems.values()]
    .map((p) => p.rating)
    .filter((r) => typeof r === 'number');

  return {
    username,
    rating: userInfo.rating || null,
    maxRating: userInfo.maxRating || null,
    rank: userInfo.rank || null,
    maxRank: userInfo.maxRank || null,
    contribution: userInfo.contribution || 0,
    totalSolved: solvedProblems.size,
    totalSubmissions,
    tagCounts,
    avgSolvedRating: solvedRatings.length
      ? Math.round(solvedRatings.reduce((a, b) => a + b, 0) / solvedRatings.length)
      : null,
    maxSolvedRating: solvedRatings.length ? Math.max(...solvedRatings) : null,
  };
}

// ---------------------------------------------------------------------
// Groq AI: build strict-JSON system prompt and call the API
// ---------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an elite Competitive Programming (CP) Coach with deep expertise across LeetCode and Codeforces. You analyze raw profile/submission data and produce an honest, specific, and actionable skill assessment.

You MUST respond with ONLY a single valid JSON object and nothing else. The JSON object must have EXACTLY this shape:

{
  "comprehensive_score": <integer 0-100>,
  "skill_level": <one of "Beginner", "Intermediate", "Advanced", "Expert">,
  "total_solved_combined": <integer>,
  "strengths": [ { "topic": <string>, "reason": <string> }, ... ],
  "weaknesses": [ { "topic": <string>, "reason": <string> }, ... ],
  "roadmap_recommendations": [ <string>, <string>, ... ],
  "coach_summary": <string, 2-4 sentences, encouraging but honest>
}

Rules:
- Base every judgment strictly on the data provided. Do not invent statistics.
- "strengths" and "weaknesses" should reference concrete topics/tags (e.g. "Dynamic Programming", "Graphs", "Greedy") backed by the data.
- Provide 2-5 items in "strengths" and 2-5 items in "weaknesses".
- "roadmap_recommendations" should be 4-8 concrete, ordered next steps.
- "comprehensive_score" should weigh problem count, difficulty distribution, contest rating, and topic breadth.
- If only one platform's data is provided, base the analysis on that platform alone.
- Output raw JSON only.`;

async function callGroqAI(userDataPayload) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured on the server.');
  }

  const model = process.env.GROQ_MODEL || 'llama3-8b-8192';

  // استدعاء Groq API بنفس أسلوب شات جي بي تي المتوافق مع المعايير الحديثة
  const response = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Here is the raw competitive programming data to analyze:\n\n${JSON.stringify(
          userDataPayload,
          null,
          2
        )}`,
      },
    ],
    model: model,
    temperature: 0.4,
    // هذه الخاصية تجبر الموديل على إرجاع JSON سليم 100% بدون أي كلام جانبي
    response_format: { type: 'json_object' }, 
  });

  const text = response.choices[0]?.message?.content;

  if (!text) {
    throw new Error('Groq API returned an empty response.');
  }

  return parseAIJson(text);
}

function parseAIJson(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}`);
  }

  const required = [
    'comprehensive_score',
    'skill_level',
    'total_solved_combined',
    'strengths',
    'weaknesses',
    'roadmap_recommendations',
    'coach_summary',
  ];
  const missing = required.filter((k) => !(k in parsed));
  if (missing.length) {
    throw new Error(`AI response missing required fields: ${missing.join(', ')}`);
  }

  return parsed;
}

// ---------------------------------------------------------------------
// Database persistence
// ---------------------------------------------------------------------
async function saveAnalysis({
  leetcodeUsername,
  codeforcesUsername,
  aiResult,
  rawLeetcode,
  rawCodeforces,
}) {
  const query = `
    INSERT INTO analyses (
      leetcode_username, codeforces_username,
      comprehensive_score, skill_level, total_solved_combined,
      strengths, weaknesses, roadmap_recommendations, coach_summary,
      raw_leetcode_data, raw_codeforces_data
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id, created_at;
  `;

  const values = [
    leetcodeUsername || null,
    codeforcesUsername || null,
    aiResult.comprehensive_score,
    aiResult.skill_level,
    aiResult.total_solved_combined,
    JSON.stringify(aiResult.strengths || []),
    JSON.stringify(aiResult.weaknesses || []),
    JSON.stringify(aiResult.roadmap_recommendations || []),
    aiResult.coach_summary || '',
    rawLeetcode ? JSON.stringify(rawLeetcode) : null,
    rawCodeforces ? JSON.stringify(rawCodeforces) : null,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

// ---------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/analyze', async (req, res) => {
  try {
    // بدل الكود القديم، حط ده عشان تضمن إن الكود ما يضربش لو الـ body فاضي
const body = req.body || {};
const leetcodeUsername = (body.leetcodeUsername || '').trim();
const codeforcesUsername = (body.codeforcesUsername || '').trim();

    if (!leetcodeUsername && !codeforcesUsername) {
      return res.status(400).json({
        error: 'Provide at least one of leetcodeUsername or codeforcesUsername.',
      });
    }

    if (leetcodeUsername && !isValidUsername(leetcodeUsername)) {
      return res.status(400).json({ error: 'Invalid LeetCode username format.' });
    }
    if (codeforcesUsername && !isValidUsername(codeforcesUsername)) {
      return res.status(400).json({ error: 'Invalid Codeforces username format.' });
    }

    const [leetcodeResult, codeforcesResult] = await Promise.allSettled([
      leetcodeUsername ? fetchLeetCodeData(leetcodeUsername) : Promise.resolve(null),
      codeforcesUsername ? fetchCodeforcesData(codeforcesUsername) : Promise.resolve(null),
    ]);

    const leetcodeData =
      leetcodeResult.status === 'fulfilled' ? leetcodeResult.value : null;
    const codeforcesData =
      codeforcesResult.status === 'fulfilled' ? codeforcesResult.value : null;

    const leetcodeFailed = leetcodeUsername && !leetcodeData;
    const codeforcesFailed = codeforcesUsername && !codeforcesData;

    if (leetcodeFailed && codeforcesFailed) {
      return res.status(404).json({
        error: 'Could not find data for either username. Please check spelling and try again.',
      });
    }

    const analysisPayload = {
      leetcode: leetcodeData,
      codeforces: codeforcesData,
    };

    let aiResult;
    try {
      // استدعاء دالة Groq الجديدة هنا بدلاً من جيميني
      aiResult = await callGroqAI(analysisPayload);
    } catch (aiErr) {
      console.error('[Groq error]', aiErr.message);
      return res.status(502).json({
        error: 'The AI analysis service failed to produce a valid result. Please try again shortly.',
        details: aiErr.message,
      });
    }

    let saved = null;
    try {
      saved = await saveAnalysis({
        leetcodeUsername: leetcodeUsername || null,
        codeforcesUsername: codeforcesUsername || null,
        aiResult,
        rawLeetcode: leetcodeData,
        rawCodeforces: codeforcesData,
      });
    } catch (dbErr) {
      console.error('[DB save error]', dbErr.message);
    }

    return res.json({
      success: true,
      id: saved ? saved.id : null,
      created_at: saved ? saved.created_at : new Date().toISOString(),
      warnings: {
        leetcode_not_found: Boolean(leetcodeFailed),
        codeforces_not_found: Boolean(codeforcesFailed),
      },
      analysis: aiResult,
    });
  } catch (err) {
    console.error('[Unhandled /api/analyze error]', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const result = await pool.query(
      `SELECT id, leetcode_username, codeforces_username, comprehensive_score,
              skill_level, total_solved_combined, coach_summary, created_at
       FROM analyses
       ORDER BY created_at DESC
       LIMIT $1;`,
      [limit]
    );
    res.json({ success: true, results: result.rows });
  } catch (err) {
    console.error('[/api/history error]', err);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;