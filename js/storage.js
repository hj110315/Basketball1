// High score storage (per difficulty) in localStorage.
const Storage = (() => {
  'use strict';
  const KEY = 'hoopFrenzy.scores.v1';
  const MAX = 10;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable: scores just won't persist */ }
  }

  return {
    getScores(diff) {
      return load()[diff] || [];
    },
    best(diff) {
      const s = this.getScores(diff);
      return s.length ? s[0].score : 0;
    },
    qualifies(diff, score) {
      if (score <= 0) return false;
      const s = this.getScores(diff);
      return s.length < MAX || score > s[s.length - 1].score;
    },
    // Returns the index of the inserted entry in the updated list.
    add(diff, name, score) {
      const data = load();
      const list = data[diff] || [];
      const entry = { name, score, date: Date.now() };
      list.push(entry);
      list.sort((a, b) => b.score - a.score || a.date - b.date);
      data[diff] = list.slice(0, MAX);
      save(data);
      return data[diff].indexOf(data[diff].find((e) => e.date === entry.date && e.name === name));
    },
  };
})();
