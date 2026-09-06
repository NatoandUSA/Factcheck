export function createProjectBoundLoader(fetchImpl = (...args) => fetch(...args)) {
  let generation = 0;
  let controller = null;

  const dispose = () => {
    generation += 1;
    if (controller) controller.abort();
    controller = null;
  };

  const load = async ({
    projectId, url, clear, select, apply, onError
  }) => {
    const requestGeneration = ++generation;
    if (controller) controller.abort();
    controller = new AbortController();
    clear();
    if (!projectId) return { status: 'EMPTY' };

    try {
      const response = await fetchImpl(url, {
        credentials: 'include',
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error || 'PROJECT_REHYDRATION_FAILED');
      }
      if (Number(payload.projectId) !== Number(projectId)) {
        throw new Error('PROJECT_RESPONSE_SCOPE_MISMATCH');
      }
      const selected = select(payload);
      if (requestGeneration !== generation) return { status: 'STALE' };
      if (selected === null) return { status: 'EMPTY' };
      apply(selected, payload);
      return { status: 'READY' };
    } catch (error) {
      if (requestGeneration !== generation || error?.name === 'AbortError') {
        return { status: 'STALE' };
      }
      clear();
      onError(error);
      return { status: 'ERROR', error };
    }
  };

  return { load, dispose };
}
