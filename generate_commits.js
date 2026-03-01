#!/usr/bin/env node
/**
 * Generate backdated git commits for GitHub contribution graph.
 * Usage: node generate_commits.js [--dry-run] [--seed N]
 *         node generate_commits.js --eye [--dry-run]  (eye only Jan 1–Feb 27 2026)
 * Run from repo root. Expects clean working tree or orphan branch.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const eyeMode = args.includes('--eye');
const seedArg = args.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1], 10) : null;
const repoArg = args.find(a => a.startsWith('--repo='));
const REPO_ROOT = repoArg ? path.resolve(repoArg.split('=')[1]) : process.cwd();
const LOG_FILE = path.join(REPO_ROOT, 'commits.log');

const YEARS_BACK = 3;
const MIN_COMMITS_PER_DAY = 1;
const MAX_COMMITS_PER_DAY = 20;

// Eye mode: only Jan 1 2026 – Feb 27 2026 (9×7 grid). No commits outside this range.
const EYE_START = new Date(Date.UTC(2026, 0, 1));
const EYE_END = new Date(Date.UTC(2026, 1, 27));
const EYE_COLS = 9;
const EYE_ROWS = 7;
const EYE_FIRST_MONDAY = new Date(Date.UTC(2025, 11, 29));

function getContributionGridPosition(date) {
  const d = new Date(date);
  const row = d.getUTCDay();
  const dayMs = 24 * 60 * 60 * 1000;
  const col = Math.floor((d.getTime() - EYE_FIRST_MONDAY.getTime()) / (7 * dayMs));
  return { col, row };
}

function getEyeCommitsForCell(col, row) {
  const cx = 4, cy = 3;
  const dx = col - cx, dy = row - cy;
  if (col === cx && row === cy) return 0;
  const inIris = (dx * dx) / (2.5 * 2.5) + (dy * dy) / (2 * 2) <= 1;
  if (inIris) {
    const dist = (dx * dx) / (2.5 * 2.5) + (dy * dy) / (2 * 2);
    return dist <= 0.4 ? 20 : 8;
  }
  return 0;
}

function getEyeCommitsForDate(date) {
  const { col, row } = getContributionGridPosition(date);
  if (col < 0 || col >= EYE_COLS || row < 0 || row >= EYE_ROWS) return 0;
  return getEyeCommitsForCell(col, row);
}

function formatGitDateUTC(year, month, date, secondOffset = 0) {
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')} 12:00:${String(secondOffset).padStart(2, '0')} +0000`;
}

// Seeded random (mulberry32)
function createRng(s) {
  return function next() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = seed != null ? createRng(seed) : () => Math.random();

function randomInt(min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Week key = Monday of that week (YYYY-MM-DD) for deterministic weekend choice
function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const mon = day === 0 ? -6 : 1 - day; // days back to Monday
  d.setDate(d.getDate() + mon);
  return dateKey(d);
}

const weekWeekend = new Map(); // weekKey -> 'sat' | 'sun' | null

/** 5 or 6 days per week: Mon–Fri always; 50% of weeks add exactly one of Sat or Sun. */
function isContributionDay(date) {
  const day = date.getDay(); // 0 Sun .. 6 Sat
  if (day >= 1 && day <= 5) return true; // Mon–Fri
  const wk = getWeekKey(date);
  if (!weekWeekend.has(wk)) weekWeekend.set(wk, rng() < 0.5 ? (rng() < 0.5 ? 'sat' : 'sun') : null);
  const weekend = weekWeekend.get(wk);
  return (day === 6 && weekend === 'sat') || (day === 0 && weekend === 'sun');
}

function formatGitDate(d, secondOffset = 0) {
  const copy = new Date(d);
  copy.setHours(12, 0, secondOffset, 0);
  return copy.toISOString().replace('T', ' ').slice(0, 19);
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function runGit(env, command) {
  const fullEnv = { ...process.env, ...env };
  if (dryRun) {
    console.log('[dry-run]', 'env', env, command);
    return;
  }
  execSync(command, { env: fullEnv, cwd: REPO_ROOT, stdio: 'inherit', shell: true });
}

function main() {
  let startDate, endDate;

  if (eyeMode) {
    startDate = new Date(EYE_START);
    endDate = new Date(EYE_END);
    console.log('Eye mode: commits only Jan 1 – Feb 27 2026 (UTC)');
  } else {
    endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    startDate = addDays(endDate, -365 * YEARS_BACK);
  }

  console.log(`Range: ${dateKey(startDate)} to ${dateKey(endDate)}`);
  if (dryRun) console.log('DRY RUN - no commits will be made.\n');

  const readmePath = path.join(REPO_ROOT, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, '# commit_graph_hacks\n\nBackfilled contribution history.\n', 'utf8');
  }

  let totalCommits = 0;

  if (eyeMode) {
    const initDateStr = formatGitDateUTC(2025, 12, 28);
    if (!dryRun) fs.writeFileSync(LOG_FILE, '2025-12-28 initial\n', 'utf8');
    runGit(
      { GIT_AUTHOR_DATE: initDateStr, GIT_COMMITTER_DATE: initDateStr },
      'git add README.md commits.log && git commit -m "Initial commit"'
    );
    if (!dryRun) totalCommits++;

    const oneDayMs = 24 * 60 * 60 * 1000;
    for (let t = EYE_START.getTime(); t <= EYE_END.getTime(); t += oneDayMs) {
      const d = new Date(t);
      const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
      const dayStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const n = getEyeCommitsForDate(d);
      for (let i = 0; i < n; i++) {
        const dateStr = formatGitDateUTC(y, m, day, i);
        if (!dryRun) fs.appendFileSync(LOG_FILE, `${dayStr} ${i + 1}/${n}\n`, 'utf8');
        runGit(
          { GIT_AUTHOR_DATE: dateStr, GIT_COMMITTER_DATE: dateStr },
          `git add commits.log && git commit -m "contrib ${dayStr}"`
        );
        totalCommits++;
      }
    }
  } else {
    let current = new Date(startDate);
    const firstLine = `${dateKey(startDate)} initial\n`;
    if (!dryRun) fs.writeFileSync(LOG_FILE, firstLine, 'utf8');
    runGit(
      { GIT_AUTHOR_DATE: formatGitDate(startDate), GIT_COMMITTER_DATE: formatGitDate(startDate) },
      'git add README.md commits.log && git commit -m "Initial commit"'
    );
    if (!dryRun) totalCommits++;
    current = addDays(current, 1);

    while (current <= endDate) {
      if (!isContributionDay(current)) {
        current = addDays(current, 1);
        continue;
      }
      const n = randomInt(MIN_COMMITS_PER_DAY, MAX_COMMITS_PER_DAY);
      const dayStr = dateKey(current);
      for (let i = 0; i < n; i++) {
        if (!dryRun) fs.appendFileSync(LOG_FILE, `${dayStr} ${i + 1}/${n}\n`, 'utf8');
        runGit(
          { GIT_AUTHOR_DATE: formatGitDate(current, i), GIT_COMMITTER_DATE: formatGitDate(current, i) },
          `git add commits.log && git commit -m "contrib ${dayStr}"`
        );
        totalCommits++;
      }
      current = addDays(current, 1);
    }
  }

  console.log(`\nTotal commits: ${totalCommits}`);
}

main();
