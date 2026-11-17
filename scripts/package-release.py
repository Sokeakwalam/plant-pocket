from pathlib import Path
import re, shutil
root=Path(__file__).resolve().parent.parent
version="v7"
names=["core.js","data.js","app.js","sync-core.js","firebase-config.js","sync-ui.js","styles.css"]
target=root/"dist/releases"/version
target.mkdir(parents=True,exist_ok=True)
for name in names:shutil.copyfile(root/"dist"/name,target/name)
page=root/"dist/index.html"
html=page.read_text()
for name in names:
 html=re.sub(r'\./(?:releases/v\d+/)?'+re.escape(name),f"./releases/{version}/{name}",html)
page.write_text(html)
print("Prepared versioned app assets:",version)
