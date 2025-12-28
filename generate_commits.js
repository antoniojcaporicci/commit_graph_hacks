#!/usr/bin/env node
/**
 * Generate backdated git commits for GitHub contribution graph.
 * Usage: node generate_commits.js [--dry-run] [--seed N]
 * Run from repo root. Expects clean working tree or orphan branch.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const seedArg = args.find(a => a.startsWith('--seed='));
const seed = seedArg ? parseInt(seedArg.split('=')[1], 10) : null;
const repoArg = args.find(a => a.startsWith('--repo='));
const REPO_ROOT = repoArg ? path.resolve(repoArg.split('=')[1]) : process.cwd();
const LOG_FILE = path.join(REPO_ROOT, 'commits.log');

const YEARS_BACK = 3;
const MIN_COMMITS_PER_DAY = 1;
const MAX_COMMITS_PER_DAY = 20;

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
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = addDays(endDate, -365 * YEARS_BACK);

  console.log(`Range: ${dateKey(startDate)} to ${dateKey(endDate)}`);
  if (dryRun) console.log('DRY RUN - no commits will be made.\n');

  // Ensure README exists for initial commit
  const readmePath = path.join(REPO_ROOT, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, '# commit_graph_hacks\n\nBackfilled contribution history.\n', 'utf8');
  }

  let totalCommits = 0;
  let current = new Date(startDate);

  // First commit: README + first line of commits.log at startDate
  const firstLine = `${dateKey(startDate)} initial\n`;
  if (!dryRun) fs.writeFileSync(LOG_FILE, firstLine, 'utf8');
  const firstDateStr = formatGitDate(startDate);
  runGit(
    { GIT_AUTHOR_DATE: firstDateStr, GIT_COMMITTER_DATE: firstDateStr },
    'git add README.md commits.log && git commit -m "Initial commit"'
  );
  if (!dryRun) totalCommits++;
  current = addDays(current, 1);

  // Iterate day by day
  while (current <= endDate) {
    if (!isContributionDay(current)) {
      current = addDays(current, 1);
      continue;
    }

    const n = randomInt(MIN_COMMITS_PER_DAY, MAX_COMMITS_PER_DAY);
    const dayStr = dateKey(current);

    for (let i = 0; i < n; i++) {
      const line = `${dayStr} ${i + 1}/${n}\n`;
      if (!dryRun) fs.appendFileSync(LOG_FILE, line, 'utf8');
      const dateStr = formatGitDate(current, i);
      runGit(
        { GIT_AUTHOR_DATE: dateStr, GIT_COMMITTER_DATE: dateStr },
        `git add commits.log && git commit -m "contrib ${dayStr}"`
      );
      totalCommits++;
    }

    current = addDays(current, 1);
  }

  console.log(`\nTotal commits: ${totalCommits}`);
}

main();
