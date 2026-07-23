/**
 * Free port 9222 by killing any process using it.
 * This runs before electron-vite dev to ensure the CDP port is available.
 */

const { exec } = require('child_process');

const PORT = 9222;

function freePort() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Windows: Find and kill process using port
      exec(`netstat -ano | findstr :${PORT} | findstr LISTENING`, (err, stdout) => {
        if (err || !stdout.trim()) {
          console.log(`Port ${PORT} is free`);
          resolve();
          return;
        }
        
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            pids.add(pid);
          }
        }
        
        if (pids.size === 0) {
          console.log(`Port ${PORT} is free`);
          resolve();
          return;
        }
        
        let killed = 0;
        for (const pid of pids) {
          exec(`taskkill /PID ${pid} /F`, (killErr) => {
            if (!killErr) {
              console.log(`Killed process ${pid} that was using port ${PORT}`);
            }
            killed++;
            if (killed === pids.size) {
              // Wait a moment for port to be freed
              setTimeout(resolve, 500);
            }
          });
        }
      });
    } else {
      // macOS/Linux
      exec(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, (err) => {
        if (!err) {
          console.log(`Freed port ${PORT}`);
        }
        setTimeout(resolve, 500);
      });
    }
  });
}

freePort().then(() => {
  console.log('Ready to start Electron');
  process.exit(0);
}).catch((err) => {
  console.error('Error freeing port:', err);
  process.exit(0); // Continue even if error
});
