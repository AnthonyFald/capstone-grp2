"""Sample whole-device telemetry, not process-specific power."""
import argparse, csv, datetime, subprocess, time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--seconds',type=int,default=600);p.add_argument('--output',type=Path,required=True)
args=p.parse_args();args.output.parent.mkdir(parents=True,exist_ok=True)
with args.output.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f);w.writerow(['timestamp_utc','gpu','memory_used_mib','utilization_percent','power_watts','temperature_c'])
    end=time.monotonic()+args.seconds
    while time.monotonic()<end:
        r=subprocess.run(['nvidia-smi','--query-gpu=name,memory.used,utilization.gpu,power.draw,temperature.gpu','--format=csv,noheader,nounits'],capture_output=True,text=True,check=True)
        for line in r.stdout.splitlines():w.writerow([datetime.datetime.now(datetime.timezone.utc).isoformat()]+[s.strip() for s in line.split(',')])
        f.flush();time.sleep(1)
print(args.output)
