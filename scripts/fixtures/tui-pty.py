"""Own one empty Codex TUI under a PTY; no model prompt is submitted."""
import json, os, pty, select, signal, struct, sys, termios, fcntl, re

args = json.load(open(sys.argv[1]))
pid, master = pty.fork()
if pid == 0:
    os.environ['TERM'] = 'xterm-256color'
    os.execvp('codex', ['codex'] + args)
fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
print(json.dumps(dict(event='started', pid=pid)), flush=True)
observed = 0
tail = b''
alive = True
try:
    while True:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            alive = False
            print(json.dumps(dict(event='exited', status=status, terminalBytes=observed)), flush=True)
            break
        ready, _, _ = select.select([master, sys.stdin], [], [], 0.1)
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b''
            observed += len(data)
            tail = (tail + data)[-8192:]
            if b'\x1b[6n' in data:
                os.write(master, b'\x1b[1;1R')
            if b'\x1b[c' in data:
                os.write(master, b'\x1b[?1;2c')
        if sys.stdin in ready:
            command = sys.stdin.readline()
            if not command:
                os.kill(pid, signal.SIGTERM)
            else:
                item = json.loads(command)
                if item.get('kill') == 'SIGKILL':
                    os.kill(pid, signal.SIGKILL)
                if item.get('snapshot'):
                    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', tail.decode('utf8', errors='replace'))
                    print(json.dumps(dict(event='snapshot', text=text[-1800:])), flush=True)
                if item.get('input') == '\r':
                    os.write(master, b'\r')
finally:
    if alive:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    os.close(master)
