/** Share one cooperative browser yield after consuming the CPU time budget. */
export function createCooperativeLoadBudget({
  budgetMs = 8,
  now = () => performance.now(),
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  let lastYield = now();
  let pending = null;
  return async () => {
    if (pending) return pending;
    if (now() - lastYield < budgetMs) return false;
    pending = Promise.resolve().then(yieldTask).then(() => true).finally(() => {
      lastYield = now();
      pending = null;
    });
    return pending;
  };
}
