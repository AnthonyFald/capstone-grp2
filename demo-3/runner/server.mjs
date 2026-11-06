// Retired: the browser-based runner could remain alive after its tab closed.
// Demo 3 now starts only through the visible native app and its explicit On switch.
// Keep this entry as a safe failure for old shortcuts instead of starting any service.
console.error('The background browser runner has been removed. Open "Open Demo 3.cmd" and use the visible app On button.');
process.exitCode=1;
