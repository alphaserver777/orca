#!/usr/bin/python3
"""Keep the raw runtime port local when pairing expands its listener."""
import shutil,subprocess
for program in ['iptables','ip6tables']:
 executable=shutil.which(program)
 if not executable:continue
 rule=['INPUT','!','-i','lo','-p','tcp','--dport','3040','-m','comment','--comment','orca-https-only','-j','REJECT']
 if subprocess.run([executable,'-C']+rule,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
  subprocess.run([executable,'-I']+rule,check=True)
