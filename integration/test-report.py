"""Print a bounded test summary; never echo browser URLs or credential-bearing lines."""
from pathlib import Path
import sys

lines=Path(sys.argv[1]).read_text(errors='replace').splitlines()
safe=[]
for line in lines:
    lowered=line.lower()
    if len(line)>350 or any(word in lowered for word in ['http','ws://','orca://','pairing','token','eyj','stdout:','stderr:','output:']):
        continue
    safe.append(line)
print('\n'.join(safe[-40:]))
