
import { LogContent, HistoryLog } from './types';
import { Member, Offer, Need } from '../api/types';
import { SeededRandom } from '../utils/seededRandom';

// Generic interface for items
export type Item = Offer | Need;

interface Dataset {
  targetMember: Member;
  items: Item[];
  members: Map<string, Member>;
  history: HistoryLog[];
  globalFeaturedIndex: Map<string, number>;
  rng?: SeededRandom; // Optional seeded RNG for reproducibility
}

interface Options {
  // k removed, internal constant K=1000 used
  freshCount: number; // M
  randomCount: number; // N
}

export const getDistance = (m1: Member, m2: Member): number => {
  if (!m1.attributes.location || !m2.attributes.location) {
    return Infinity;
  }
  const lon1 = m1.attributes.location.coordinates[0];
  const lat1 = m1.attributes.location.coordinates[1];
  const lon2 = m2.attributes.location.coordinates[0];
  const lat2 = m2.attributes.location.coordinates[1];
  
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c; // in metres
  
  return d;
};

// Weighted random selection
const weightedRandom = (items: Item[], scores: Map<string, number>, rng?: SeededRandom): Item | null => {
  if (items.length === 0) return null;

  let totalWeight = 0;
  const weights = items.map(item => {
    const w = scores.get(item.id) || 0;
    totalWeight += w;
    return w;
  });

  const rand = rng ? rng.random() : Math.random();
  if (totalWeight === 0) return items[Math.floor(rand * items.length)];

  let random = rand * totalWeight;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
};

export const selectBestItems = (
  { targetMember, items, members, history, globalFeaturedIndex, rng }: Dataset,
  { freshCount, randomCount }: Options
): Item[] => {
  const result: Item[] = [];
  const selectedIds = new Set<string>();

  // Helper to get author ID
  const getAuthorId = (item: Item) => item.relationships.member.data.id;

  // Constants for scoring
  const WEIGHT_DISTANCE = 0.3;
  const WEIGHT_TIME = 0.6;
  const WEIGHT_QUALITY = 0.1;
  const HALF_LIFE_DISTANCE = 10000; // 10km in meters
  const HALF_LIFE_TIME = 3 * 30 * 24 * 60 * 60 * 1000; // 3 months in milliseconds
  const DISTANCE_THRESHOLD = 1000; // 1km in meters
  const HISTORIC_PENALTY_BASE = 0.5;
  const GLOBAL_EQUALITY_PENALTY_BASE = 0.5;
  const REPEATED_MEMBER_PENALTY = 0.01;
  const REPEATED_CATEGORY_PENALTY = 0.1;
  const MAX_FRESH_CANDIDATES = 100;

  // 1. FRESH & CLOSE (M items)
  // -------------------------
  const lastNewsletterDate = history.length > 0 ? new Date(history[0].sentAt) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Filter candidates: Not own items, limit to most recent items
  // Assumes items are ordered by update date (latest first)
  let freshCandidates = items
    .filter(item => getAuthorId(item) !== targetMember.id)
    .slice(0, MAX_FRESH_CANDIDATES);

  // Initialize Scores
  const scores = new Map<string, number>();

  const computeScore = (item: Item) => {
    const authorId = getAuthorId(item);
    const author = members.get(authorId);
    if (!author) return 0;

    // Distance Score
    const d = getDistance(targetMember, author);
    let scoreDistance = 1.0;
    if (d > DISTANCE_THRESHOLD) {
      // Exponential decay using half-life formula
      // score = exp(-ln(2) * (d - threshold) / half_life)
      const lambda = Math.log(2) / HALF_LIFE_DISTANCE;
      scoreDistance = Math.exp(-lambda * (d - DISTANCE_THRESHOLD));
    }

    // Time Score
    const itemCreationDate = new Date(item.attributes.updated);
    const now = Date.now();
    const itemAge = now - itemCreationDate.getTime(); // How old the item is
    const timeSinceLastNewsletter = now - lastNewsletterDate.getTime();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    
    const TIME_THRESHOLD = Math.min(oneMonth, timeSinceLastNewsletter);
    
    let scoreTime = 1.0;
    if (itemAge > TIME_THRESHOLD) {
      // Item is older than threshold - apply exponential decay
      const lambda = Math.log(2) / HALF_LIFE_TIME;
      scoreTime = Math.exp(-lambda * (itemAge - TIME_THRESHOLD));
    }
    // Otherwise (item age <= TIME_THRESHOLD): scoreTime stays 1.0

    // Quality Score
    const hasImages = item.attributes.images && item.attributes.images.length > 0;
    const scoreQuality = hasImages ? 1.0 : 0.33;

    // Base score combining distance, time, and quality
    let score = WEIGHT_DISTANCE * scoreDistance + WEIGHT_TIME * scoreTime + WEIGHT_QUALITY * scoreQuality;

    // Historic Penalty
    for (let m = 1; m <= 3; m++) {
      if (m > history.length) break;
      const log = history[m - 1];
      const content = log.content as LogContent;
      const oldItemIds = [...(content.bestOffers || []), ...(content.bestNeeds || [])];

      // Check if this author provided any of these items
      const authorsInLog = new Set<string>();
      oldItemIds.forEach(id => {
        const i = items.find(x => x.id === id);
        if (i) authorsInLog.add(getAuthorId(i));
      });

      if (authorsInLog.has(authorId)) {
        score *= Math.pow(HISTORIC_PENALTY_BASE, 4 - m);
      }
    }

    // Item Equality Penalty (Global)
    const N = globalFeaturedIndex.get(item.id) || 0;
    if (N > 0) {
      score *= Math.pow(GLOBAL_EQUALITY_PENALTY_BASE, N);
    }

    return score;
  };

  // Initial score calculation
  freshCandidates.forEach(item => scores.set(item.id, computeScore(item)));

  // Selection Loop for Fresh items
  for (let i = 0; i < freshCount; i++) {
    if (freshCandidates.length === 0) break;

    const selected = weightedRandom(freshCandidates, scores, rng);
    if (!selected) break;

    result.push(selected);
    selectedIds.add(selected.id);

    // Update global index immediately (simulated for this batch?) 
    // The prompt says "maintain a global group featured index". 
    // Usually means update the map passed in.
    globalFeaturedIndex.set(selected.id, (globalFeaturedIndex.get(selected.id) || 0) + 1);

    // Remove selected from candidates
    freshCandidates = freshCandidates.filter(item => item.id !== selected.id);

    // Update scores for remaining candidates
    // Sympathy penalty: same category * REPEATED_CATEGORY_PENALTY, same member * REPEATED_MEMBER_PENALTY
    const selectedCategory = (selected as any).relationships.category?.data?.id;
    const selectedAuthor = getAuthorId(selected);

    freshCandidates.forEach(candidate => {
      let currentScore = scores.get(candidate.id) || 0;

      // Same Author penalty
      if (getAuthorId(candidate) === selectedAuthor) {
        currentScore *= REPEATED_MEMBER_PENALTY;
      }

      // Same Category penalty
      const candidateCategory = (candidate as any).relationships.category?.data?.id;
      if (selectedCategory && candidateCategory && selectedCategory === candidateCategory) {
        currentScore *= REPEATED_CATEGORY_PENALTY;
      }

      scores.set(candidate.id, currentScore);
    });
  }

  // 2. RANDOM (N items)
  // -------------------

  // Candidates: All items excluding own and already selected
  const randomCandidates = items.filter(item =>
    getAuthorId(item) !== targetMember.id &&
    !selectedIds.has(item.id)
  );

  // Fill remaining slots

  const totalTarget = freshCount + randomCount;

  while (result.length < totalTarget && randomCandidates.length > 0) {
    // Pure random
    const rand = rng ? rng.random() : Math.random();
    let pickIndex = Math.floor(rand * randomCandidates.length);
    let pick = randomCandidates[pickIndex];

    // Retry 3 times if shares member or category with ANY previously selected
    for (let retry = 0; retry < 3; retry++) {
      const pickAuthor = getAuthorId(pick);
      const pickCategory = (pick as any).relationships.category?.data?.id;

      const conflict = result.some(existing => {
        const exAuthor = getAuthorId(existing);
        const exCategory = (existing as any).relationships.category?.data?.id;
        return exAuthor === pickAuthor || (pickCategory && exCategory && pickCategory === exCategory);
      });

      if (!conflict) break; // Good to go

      // Try again
      const retryRand = rng ? rng.random() : Math.random();
      pickIndex = Math.floor(retryRand * randomCandidates.length);
      pick = randomCandidates[pickIndex];
    }

    result.push(pick);
    selectedIds.add(pick.id);
    globalFeaturedIndex.set(pick.id, (globalFeaturedIndex.get(pick.id) || 0) + 1);

    // Remove from candidates
    randomCandidates.splice(pickIndex, 1);
  }

  return result;
};
