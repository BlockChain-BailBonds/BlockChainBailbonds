export function startAppWatcher(service, {intervalMs = 5000} = {}) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await service.reconcileInstalledApps();
      if ((result.new_apps ?? 0) > 0 || (result.failed?.length ?? 0) > 0) {
        await service.audit.write({event:'app.watcher.reconcile', result});
      }
    } catch (error) {
      await service.audit.write({event:'app.watcher.error', error:error.message}).catch(() => {});
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  return {stop: () => clearInterval(timer), tick};
}
