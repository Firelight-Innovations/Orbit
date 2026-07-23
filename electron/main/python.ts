import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

export class PythonBackend {
  private process: ChildProcess | null = null
  private port: number | null = null
  private ready = false
  private startPromise: Promise<void> | null = null

  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this._start()
    return this.startPromise
  }

  private async _start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Find a random available port
      this.port = 8000 + Math.floor(Math.random() * 1000)

      // Get the backend path
      const backendPath = is.dev
        ? join(process.cwd(), 'backend')
        : join(process.resourcesPath, 'backend')

      // Prefer the backend's own venv interpreter so boot doesn't depend on
      // whether the launching shell activated it. Fall back to PATH python.
      const venvPython =
        process.platform === 'win32'
          ? join(backendPath, '.venv', 'Scripts', 'python.exe')
          : join(backendPath, '.venv', 'bin', 'python3')
      const fallbackPython = process.platform === 'win32' ? 'python' : 'python3'
      const pythonCmd = existsSync(venvPython) ? venvPython : fallbackPython

      console.log(`Starting Python backend on port ${this.port}...`)
      console.log(`Backend path: ${backendPath}`)
      console.log(`Python executable: ${pythonCmd}`)

      this.process = spawn(
        pythonCmd,
        ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(this.port)],
        {
          cwd: backendPath,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
          }
        }
      )

      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log(`[Python] ${output}`)

        // Check if uvicorn has started
        if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
          this.ready = true
          resolve()
        }
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.error(`[Python] ${output}`)

        // Uvicorn logs to stderr
        if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
          this.ready = true
          resolve()
        }
      })

      this.process.on('error', (err) => {
        console.error('Failed to start Python backend:', err)
        reject(err)
      })

      this.process.on('exit', (code) => {
        console.log(`Python backend exited with code ${code}`)
        this.ready = false
        this.process = null
      })

      // Timeout after 90 seconds
      setTimeout(() => {
        if (!this.ready) {
          console.warn('Python backend startup timed out, continuing anyway...')
          resolve()
        }
      }, 90000)
    })
  }

  async stop(): Promise<void> {
    if (this.process) {
      console.log('Stopping Python backend...')

      return new Promise((resolve) => {
        if (!this.process) {
          resolve()
          return
        }

        this.process.on('exit', () => {
          this.process = null
          this.ready = false
          resolve()
        })

        // Try graceful shutdown first
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'])
        } else {
          this.process.kill('SIGTERM')

          // Force kill after 5 seconds
          setTimeout(() => {
            if (this.process) {
              this.process.kill('SIGKILL')
            }
          }, 5000)
        }
      })
    }
  }

  getPort(): number | null {
    return this.port
  }

  isReady(): boolean {
    return this.ready
  }

  getBaseUrl(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}` : null
  }
}

