from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import subprocess, mimetypes
root=Path(__file__).resolve().parent.parent
current=False
legacy={name:subprocess.check_output(['git','show','571f249:dist/'+name],cwd=root) for name in ['index.html','app.js','core.js','data.js','sw.js','manifest.webmanifest']}
class Handler(BaseHTTPRequestHandler):
 def do_POST(self):
  global current
  if self.path!='/__qa/upgrade':self.send_error(404);return
  current=True;self.send_response(204);self.end_headers()
 def do_GET(self):
  name=unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
  path=(root/'dist'/name).resolve()
  if not path.is_relative_to((root/'dist').resolve()):self.send_error(403);return
  try:body=legacy[name] if not current and name in legacy else path.read_bytes()
  except (FileNotFoundError,IsADirectoryError):self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(name)[0] or 'application/octet-stream');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
print('Legacy upgrade test server at http://127.0.0.1:8088',flush=True)
ThreadingHTTPServer(('127.0.0.1',8088),Handler).serve_forever()
